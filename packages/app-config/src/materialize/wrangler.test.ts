import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
vi.mock("node:process", () => ({ cwd: () => process.cwd() }));
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWranglerJsonc } from "./wrangler.js";
import { type WranglerConfig } from "../config-file/wrangler.jsonc.js";
import { testExports } from "../config-file/deployment.yaml.js";
import type { Settings } from "./settings.js";
import { parseContext } from "./context.js";
const settings: Settings = {
  deployment: testExports.asDeployment({
    connections: { bindings: { API: "@repo/api", OTHER: "@repo/other" } },
  }),
  overrides: { ENV: "deployment" },
};
const context = parseContext({
  DEPLOY_CHANNEL: "preview",
  PR_NUMBER: "42",
  TARGETS: JSON.stringify([
    { package: "@repo/api", path: "apps/api", workerName: "api" },
  ]),
});

describe("Wrangler materialize", () => {
  it("preserves artifact paths and only redirects selected connections", () => {
    const result = materializeWrangler(
      {
        name: "web",
        main: "src/worker.ts",
        assets: { directory: "./dist" },
        routes: ["example.org"],
        vars: { ENV: "native" },
        env: {
          staging: {
            vars: { ENV: "profile" },
            services: [
              { binding: "API", service: "api" },
              { binding: "OTHER", service: "other" },
            ],
          },
        },
      },
      settings,
      context,
    );
    expect(result).toMatchObject({
      name: "web-preview-42",
      main: "src/worker.ts",
      assets: { directory: "./dist" },
      vars: { ENV: "deployment" },
      services: [
        { binding: "API", service: "api-preview-42" },
        { binding: "OTHER", service: "other-staging" },
      ],
    });
    expect(result).not.toHaveProperty("routes");
    expect(result).not.toHaveProperty("env");
  });
  it("keeps update routes and applies channel suffix once", () => {
    const result = materializeWrangler(
      {
        name: "web",
        routes: ["example.org"],
        services: [
          { binding: "API", service: "api" },
          { binding: "OTHER", service: "other" },
        ],
      },
      settings,
      parseContext({
        DEPLOY_CHANNEL: "release",
        TARGETS: JSON.stringify(
          [...context.targets].map(([packageName, target]) => ({
            package: packageName,
            path: target.path,
          })),
        ),
      }),
    );
    expect(result.name).toBe("web-release");
    expect(result.routes).toEqual(["example.org"]);
    expect(result.services?.[0]?.service).toBe("api-release");
  });
  it("rejects missing bindings", () =>
    expect(() =>
      materializeWrangler({ name: "web" }, settings, context),
    ).toThrow("Missing native binding"));
});

it("preserves native staging connections outside targets even if their declaration is unknown", () => {
  const result = materializeWrangler(
    {
      name: "web",
      services: [{ binding: "EXTERNAL", service: "shared-native" }],
    },
    {
      deployment: testExports.asDeployment({
        connections: { bindings: { EXTERNAL: "unknown-package" } },
      }),
      overrides: {},
    },
    context,
  );
  expect(result.services?.[0]?.service).toBe("shared-native-staging");
});

afterEach(() => vi.restoreAllMocks());

// ファイルI/Oだけを置き換え、公開入口を通して生成結果を検証する。
function materializeWrangler(
  original: WranglerConfig,
  settings: Parameters<typeof generateWranglerJsonc>[0],
  context: Parameters<typeof generateWranglerJsonc>[1],
): WranglerConfig {
  const directory = mkdtempSync(join(tmpdir(), "materialize-wrangler-"));
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(directory);
  try {
    writeFileSync(join(directory, "wrangler.jsonc"), JSON.stringify(original));
    generateWranglerJsonc(settings, context);
    expect(
      JSON.parse(readFileSync(join(directory, "wrangler.jsonc"), "utf8")),
    ).toEqual(original);
    return JSON.parse(
      readFileSync(join(directory, "wrangler.deploy.jsonc"), "utf8"),
    );
  } finally {
    cwd.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  }
}
