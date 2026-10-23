import { parseContext } from "./context.js";
import { expect, it } from "vitest";
import { resolvePreviewVariables } from "./connections.js";
import { testExports } from "../config-file/deployment.yaml.js";
it("preserves URL path/query and leaves connections outside targets unchanged", () => {
  const result = resolvePreviewVariables(
    {
      API: "https://api-staging.example/api/v1/?x=1",
      OTHER: "https://other-staging.example/",
    },
    {
      deployment: testExports.asDeployment({
        connections: { urls: { API: "api", OTHER: "other" } },
      }),
      overrides: {},
    },
    parseContext({
      DEPLOY_CHANNEL: "preview",
      PR_NUMBER: "8",
      TARGETS: JSON.stringify([
        { package: "api", path: "apps/api", workerName: "api" },
      ]),
    }),
  );
  expect(result.API).toBe(
    "https://api-preview-8.nushinkan2.workers.dev/api/v1/?x=1",
  );
  expect(result.OTHER).toBe("https://other-staging.example/");
});
it("falls back to workers.dev without a configured URL", () =>
  expect(
    resolvePreviewVariables(
      {},
      {
        deployment: testExports.asDeployment({
          connections: { urls: { API: "api" } },
        }),
        overrides: {},
      },
      parseContext({
        DEPLOY_CHANNEL: "preview",
        PR_NUMBER: "8",
        TARGETS: JSON.stringify([
          { package: "api", path: "apps/api", workerName: "api" },
        ]),
      }),
    ),
  ).toMatchObject({ API: "https://api-preview-8.nushinkan2.workers.dev/" }));
