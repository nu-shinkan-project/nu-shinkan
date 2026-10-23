import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { DeploymentSettings } from "./settings.js";
vi.mock("./globalRuntimeEnvs.yaml.js", () => ({
  GlobalRuntimeEnvsYaml: class {
    variablesFor(profile: "staging" | "release") {
      return { SHARED: "global", GLOBAL: profile };
    }
  },
}));
const roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});
it.each(["staging", "release"] as const)(
  "combines %s overrides and returns independent snapshots",
  (profile) => {
    const root = mkdtempSync(join(tmpdir(), "deployment-settings-"));
    roots.push(root);
    writeFileSync(
      join(root, "deployment.yaml"),
      "envs:\n  staging:\n    SHARED: deployment staging\n  release:\n    SHARED: deployment release\n",
    );
    const settings = new DeploymentSettings(root, profile);
    expect(settings.overrides).toEqual({
      SHARED: `deployment ${profile}`,
      GLOBAL: profile,
    });
    settings.overrides.SHARED = "changed";
    settings.deployment.envs[profile].SHARED = "changed";
    writeFileSync(join(root, "deployment.yaml"), "envs: {}\n");
    expect(settings.overrides.SHARED).toBe(`deployment ${profile}`);
    expect(settings.deployment.envs[profile].SHARED).toBe(
      `deployment ${profile}`,
    );
  },
);
it("uses default deployment settings when the package file is absent", () => {
  const root = mkdtempSync(join(tmpdir(), "deployment-settings-"));
  roots.push(root);
  const settings = new DeploymentSettings(root, "staging");
  expect(settings.overrides).toEqual({ SHARED: "global", GLOBAL: "staging" });
  expect(settings.deployment.connections).toEqual({ bindings: {}, urls: {} });
  expect(settings.deployment.reviewEntry).toBe(false);
  expect(settings.deployment.envs).toEqual({ staging: {}, release: {} });
});
