import { expect, it } from "vitest";
import { resolvePlannedVariables } from "./connections.js";
import { planConnections } from "./connection-plan.js";
const workers = {
  byPackage: new Map([
    ["api", "bare-api"],
    ["other", "bare-other"],
  ]),
  byWorker: new Map([
    ["bare-api", "api"],
    ["bare-other", "other"],
  ]),
};
const targets = new Set(["web", "api"]);
// Include empty connection settings for targets that are only destinations.
function connections(
  channel: "preview" | "staging" | "release",
  declarations: Record<string, string>,
) {
  return planConnections(
    new Map(
      ["web", "api"].map((name) => [
        name,
        {
          bindings: [],
          profiles: {},
          declarations: {
            bindings: {},
            urls: name === "web" ? declarations : {},
          },
        },
      ]),
    ),
    workers,
    {
      channel,
      profile: channel === "release" ? "release" : "staging",
      prNumber: 8,
    },
    targets,
    {},
  );
}
it("preserves URL path, query and hash while replacing preview host and port", () => {
  expect(
    resolvePlannedVariables(
      { API: "http://old:8080/api/v1/?x=1#part", OTHER: "https://external/" },
      connections("preview", { API: "api", OTHER: "other" }),
      8,
    ),
  ).toEqual({
    status: "resolved",
    variables: {
      API: "https://bare-api-preview-8.nushinkan2.workers.dev/api/v1/?x=1#part",
      OTHER: "https://external/",
    },
  });
});
it.each(["preview", "staging", "release"] as const)(
  "fills missing URLs for %s from planned destinations",
  (channel) => {
    expect(
      resolvePlannedVariables(
        {},
        connections(channel, { API: "api", OTHER: "other" }),
        8,
      ),
    ).toEqual({
      status: "resolved",
      variables: {
        API: `https://bare-api-${channel === "preview" ? "preview-8" : channel}.nushinkan2.workers.dev/`,
        OTHER: `https://bare-other-${channel === "release" ? "release" : "staging"}.nushinkan2.workers.dev/`,
      },
    });
  },
);
it("keeps existing non-preview URLs without requiring a Worker", () => {
  expect(
    resolvePlannedVariables(
      { API: "https://custom/path" },
      connections("staging", { API: "unknown" }),
      8,
    ),
  ).toEqual({ status: "resolved", variables: { API: "https://custom/path" } });
});
it("rejects missing fallback Workers and masks malformed values", () => {
  expect(
    resolvePlannedVariables({}, connections("preview", { API: "unknown" }), 8),
  ).toMatchObject({
    status: "connection-failed",
    reason: "No Worker for URL connection: unknown",
  });
  expect(
    resolvePlannedVariables(
      { API: "invalid secret" },
      connections("preview", { API: "api" }),
      8,
    ),
  ).toEqual({
    status: "connection-failed",
    reason: "Invalid URL for connection: API",
  });
});
