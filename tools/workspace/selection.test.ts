import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { WranglerJsonc } from "@repo/app-config/wrangler";
import { workerMapping, type WorkspaceConfiguration } from "./configs.js";
import { selectWorkspaceConfigurations } from "./selection.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const configurations: WorkspaceConfiguration[] = ["api", "web", "shared"].map(
  (packageName) => ({
    packageName,
    path: `/workspace/apps/${packageName}`,
    pathRel: `apps/${packageName}`,
  }),
);

function worker(packageName: string, name: unknown): WorkspaceConfiguration {
  const path = mkdtempSync(join(tmpdir(), "workspace-selection-"));
  roots.push(path);
  writeFileSync(join(path, "wrangler.jsonc"), JSON.stringify({ name }));
  return {
    packageName,
    path,
    pathRel: `apps/${packageName}`,
    wrangler: new WranglerJsonc(path),
  };
}

it("lists all configurations without names and selects exact names in workspace order", () => {
  expect(
    selectWorkspaceConfigurations(configurations).map(
      (pkg) => "packageName" in pkg && pkg.packageName,
    ),
  ).toEqual(["api", "web", "shared"]);
  expect(
    selectWorkspaceConfigurations(configurations, ["shared", "api", "api"]).map(
      (pkg) => "packageName" in pkg && pkg.packageName,
    ),
  ).toEqual(["api", "shared"]);
  expect(selectWorkspaceConfigurations(configurations, [])).toEqual([]);
});

it("rejects all unknown names", () => {
  expect(() =>
    selectWorkspaceConfigurations(configurations, ["api", "missing", "other"]),
  ).toThrow("Unknown packages: missing, other");
});

it.each([
  undefined,
  null,
  123,
  "",
  "My-api",
  "-api",
  "api_web",
  "api.web",
  "api web",
])(
  "rejects invalid Worker name %j without returning a partial deployment plan",
  (name) => {
    const packages = [worker("valid", "valid-api"), worker("invalid", name)];
    expect(() => workerMapping(packages)).toThrow(
      "Invalid Worker name: invalid",
    );
    expect(workerMapping(packages.slice(0, 1)).byPackage.get("valid")).toBe(
      "valid-api",
    );
    expect(selectWorkspaceConfigurations(packages)).toHaveLength(2);
  },
);

it.each(["a", "0", "my-api-2", "api-"])(
  "accepts Worker name %s under the existing naming rule",
  (name) => {
    expect(workerMapping([worker("api", name)]).byPackage.get("api")).toBe(
      name,
    );
  },
);
