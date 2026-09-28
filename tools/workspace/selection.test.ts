import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { WranglerJsonc } from "@repo/app-config/wrangler";
import type { WorkspaceConfiguration } from "./configs.js";
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
    selectWorkspaceConfigurations(configurations, []).map(
      (pkg) => "packageName" in pkg && pkg.packageName,
    ),
  ).toEqual(["api", "web", "shared"]);
  expect(
    selectWorkspaceConfigurations(configurations, ["shared", "api", "api"]).map(
      (pkg) => "packageName" in pkg && pkg.packageName,
    ),
  ).toEqual(["api", "shared"]);
  expect(selectWorkspaceConfigurations([], [])).toEqual([]);
});

it("selects exact deployment targets once in workspace order, including packages without Worker settings", () => {
  expect(
    selectWorkspaceConfigurations(configurations, ["shared", "api", "api"], {
      targets: true,
    }),
  ).toEqual([
    { package: "api", path: "apps/api" },
    { package: "shared", path: "apps/shared" },
  ]);
  expect(
    selectWorkspaceConfigurations(configurations, [], { targets: true }),
  ).toEqual([]);
});

it.each([false, true])(
  "rejects unknown names before returning a partial selection (targets=%s)",
  (targets) => {
    expect(() =>
      selectWorkspaceConfigurations(
        configurations,
        ["api", "missing", "other"],
        { targets },
      ),
    ).toThrow("Unknown packages: missing, other");
  },
);

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
    expect(() =>
      selectWorkspaceConfigurations(packages, ["valid", "invalid"], {
        targets: true,
      }),
    ).toThrow("Invalid Worker name: invalid");
    // Unselected Worker configurations cannot invalidate the selected deployment.
    expect(
      selectWorkspaceConfigurations(packages, ["valid"], { targets: true }),
    ).toEqual([
      { package: "valid", path: "apps/valid", workerName: "valid-api" },
    ]);
    expect(
      selectWorkspaceConfigurations(packages, [], { targets: true }),
    ).toEqual([]);
    // Listing does not impose deployment-only name validation.
    expect(selectWorkspaceConfigurations(packages, [])).toHaveLength(2);
  },
);

it.each(["a", "0", "my-api-2", "api-"])(
  "accepts Worker name %s under the existing naming rule",
  (name) => {
    expect(
      selectWorkspaceConfigurations([worker("api", name)], ["api"], {
        targets: true,
      }),
    ).toEqual([{ package: "api", path: "apps/api", workerName: name }]);
  },
);
