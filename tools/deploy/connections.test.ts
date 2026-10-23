import { expect, it } from "vitest";
import { resolveVariables, resolveServiceBindings } from "./connections.js";
import type { Request } from "./types.js";
const request: Request = {
  channel: "preview",
  profile: "staging",
  purpose: "review",
  source: "full",
  commit: "sha",
  base: null,
  prNumber: 8,
  packages: [],
};
const targets = new Set(["api", "web"]);
const workers = new Map([
  ["api", "bare-api"],
  ["other", "bare-other"],
]);

it("preserves URL path/query/hash and replaces the preview host, protocol and port", () => {
  expect(
    resolveVariables(
      {
        API: "http://old.example:8080/api/v1/?x=1#part",
        OTHER: "https://external.example/",
      },
      { API: "api", OTHER: "other" },
      request,
      targets,
      workers,
    ),
  ).toEqual({
    status: "resolved",
    variables: {
      API: "https://bare-api-preview-8.nushinkan2.workers.dev/api/v1/?x=1#part",
      OTHER: "https://external.example/",
    },
  });
});
it.each(["preview", "staging", "release"] as const)(
  "falls back only for missing URLs in %s",
  (channel) => {
    const current = {
      ...request,
      channel,
      profile:
        channel === "release" ? ("release" as const) : ("staging" as const),
    };
    expect(
      resolveVariables(
        {},
        { API: "api", OTHER: "other" },
        current,
        targets,
        workers,
      ),
    ).toEqual({
      status: "resolved",
      variables: {
        API: `https://bare-api-${channel === "preview" ? "preview-8" : channel}.nushinkan2.workers.dev/`,
        OTHER: `https://bare-other-${current.profile}.nushinkan2.workers.dev/`,
      },
    });
    if (channel !== "preview") {
      expect(
        resolveVariables(
          { API: "https://custom.example/path" },
          { API: "unknown" },
          current,
          targets,
          workers,
        ),
      ).toEqual({
        status: "resolved",
        variables: { API: "https://custom.example/path" },
      });
    }
  },
);
it("reports missing preview Workers and missing URL fallback Workers", () => {
  expect(
    resolveVariables(
      { API: "https://old.example" },
      { API: "web" },
      request,
      targets,
      workers,
    ),
  ).toEqual({
    status: "connection-failed",
    reason: "No Worker for URL connection: web",
  });
  expect(
    resolveVariables({}, { API: "unknown" }, request, targets, workers),
  ).toEqual({
    status: "connection-failed",
    reason: "No Worker for URL connection: unknown",
  });
});
it("reports malformed preview URLs without including configuration values", () => {
  expect(
    resolveVariables(
      { API: "invalid secret value" },
      { API: "api" },
      request,
      targets,
      workers,
    ),
  ).toEqual({
    status: "connection-failed",
    reason: "Invalid URL for connection: API",
  });
});
it("resolves preview and native service names while retaining binding attributes", () => {
  const bindings = [
    { binding: "API", service: "native-api", environment: "keep" },
    { binding: "OTHER", service: "native-other" },
    { binding: "UNDECLARED", service: "native" },
  ];
  const result = resolveServiceBindings(
    bindings,
    { API: "api", OTHER: "unknown-package" },
    request,
    targets,
    workers,
  );
  expect(result).toEqual({
    status: "resolved",
    services: [
      { binding: "API", service: "bare-api-preview-8", environment: "keep" },
      { binding: "OTHER", service: "native-other-staging" },
      { binding: "UNDECLARED", service: "native-staging" },
    ],
  });
  expect(bindings[0]!.service).toBe("native-api");
});
it.each(["staging", "release"] as const)(
  "uses native binding names in %s",
  (channel) => {
    expect(
      resolveServiceBindings(
        [{ binding: "API", service: "native-api" }],
        { API: "api" },
        { ...request, channel, profile: channel },
        targets,
        workers,
      ),
    ).toEqual({
      status: "resolved",
      services: [{ binding: "API", service: `native-api-${channel}` }],
    });
  },
);
it("reports declarations without native bindings and selected targets without Workers", () => {
  expect(
    resolveServiceBindings([], { API: "api" }, request, targets, workers),
  ).toEqual({
    status: "connection-failed",
    reason: "Missing native binding: API",
  });
  expect(
    resolveServiceBindings(
      [{ binding: "API", service: "api" }],
      { API: "web" },
      request,
      targets,
      workers,
    ),
  ).toEqual({
    status: "connection-failed",
    reason: "No Worker for binding: web",
  });
});
