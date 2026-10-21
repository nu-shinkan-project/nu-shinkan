vi.mock("node:process", () => ({ cwd: () => process.cwd() }));
import { afterEach, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
vi.mock("../config-file/globalRuntimeEnvs.yaml.js", () => ({
  GlobalRuntimeEnvsYaml: class {
    variablesFor(profile: "staging" | "release") {
      return {
        staging: { SHARED: "global", GLOBAL: "staging" },
        release: { SHARED: "release global", GLOBAL: "release" },
      }[profile];
    }
  },
}));
import { parseContext } from "./context.js";
import { readSettings } from "./settings.js";
import { generateWranglerJsonc } from "./wrangler.js";
import { type WranglerConfig } from "../config-file/wrangler.jsonc.js";
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});
it.each(["staging", "release", "preview"] as const)(
  "applies all four priority levels in %s",
  (channel) => {
    const root = mkdtempSync(join(tmpdir(), "settings-"));
    roots.push(root);
    const app = join(root, "apps/api");
    mkdirSync(app, { recursive: true });
    writeFileSync(join(app, "package.json"), JSON.stringify({ name: "api" }));
    writeFileSync(
      join(app, "wrangler.jsonc"),
      JSON.stringify({ name: "bare-api" }),
    );
    writeFileSync(
      join(app, "deployment.yaml"),
      "envs:\n  staging:\n    SHARED: deployment staging\n    SELF: https://bare-api-staging.example/api/\n  release:\n    SHARED: deployment release\n    SELF: https://bare-api-release.example/api/\nconnections:\n  urls:\n    SELF: api\n",
    );
    vi.spyOn(process, "cwd").mockReturnValue(app);
    const context = parseContext({
      DEPLOY_CHANNEL: channel,
      PR_NUMBER: "42",
      TARGETS: JSON.stringify([
        { package: "api", path: "apps/api", workerName: "bare-api" },
      ]),
    });
    const result = materializeWrangler(
      {
        name: "bare-api",
        vars: { SHARED: "native", GLOBAL: "native", NATIVE: "kept" },
      },
      readSettings(context),
      context,
    );
    expect(result.vars).toMatchObject({
      SHARED: `deployment ${channel === "release" ? "release" : "staging"}`,
      GLOBAL: channel === "release" ? "release" : "staging",
      NATIVE: "kept",
    });
    expect(result.vars?.SELF).toBe(
      channel === "preview"
        ? "https://bare-api-preview-42.nushinkan2.workers.dev/api/"
        : `https://bare-api-${channel}.example/api/`,
    );
  },
);

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
