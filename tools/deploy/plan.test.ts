import { expect, it } from "vitest";
import {
  collectOrigins,
  deploymentOrder,
  finalizePlan,
  type Inventory,
} from "./plan.js";
import type { Request } from "./types.js";
import { testExports } from "../../packages/app-config/src/config-file/deployment.yaml.js";
const request: Request = {
  channel: "preview",
  purpose: "review",
  profile: "staging",
  source: "manual-pick",
  commit: "a",
  base: "b",
  packages: ["api"],
  prNumber: 1,
};
const data: Inventory = {
  packages: ["web", "api", "outside"].map((name) => ({
    name,
    path: `apps/${name}`,
    scripts: { build: "build" },
  })),
  deployments: new Map([
    [
      "web",
      testExports.asDeployment({
        reviewEntry: true,
        connections: { urls: { API: "api" } },
      }),
    ],
  ]),
  workspace: ["web", "api", "outside"].map((name) => ({
    name,
    path: `apps/${name}`,
    scripts: {},
  })),
  connections: new Map(
    ["web", "api", "outside"].map((name) => [
      name,
      { bindings: [], profiles: {}, declarations: { bindings: {}, urls: {} } },
    ]),
  ),
  workers: { byPackage: new Map(), byWorker: new Map() },
};
it("keeps affected packages separate from hydrated targets for manual picks", () => {
  const selection = collectOrigins(request, data.packages, {
    available: true,
    files: [],
  });
  expect(finalizePlan(request, data, selection, ["api"])).toMatchObject({
    plan: { affected: ["api"], targets: ["web", "api"] },
  });
  expect(finalizePlan(request, data, selection, ["outside"])).toMatchObject({
    plan: { affected: ["outside"], targets: [] },
  });
});
it("reports all unknown names and does not fall back from manual picks", () => {
  const selection = collectOrigins(
    { ...request, packages: ["x", "y"] },
    data.packages,
    { available: false, files: [] },
  );
  expect(finalizePlan(request, data, selection, [])).toMatchObject({
    status: "invalid",
    unknownPackages: ["x", "y"],
  });
});
it("falls back only for unavailable comparisons or shared files", () => {
  const r: Request = {
    ...request,
    channel: "staging",
    profile: "staging",
    prNumber: -1,
    source: "diff",
    purpose: "update",
  };
  expect(
    collectOrigins(r, data.packages, {
      available: true,
      files: ["apps/api/a.ts"],
    }),
  ).toMatchObject({ source: "diff", origins: ["api"] });
  expect(
    collectOrigins(r, data.packages, {
      available: true,
      files: ["pnpm-lock.yaml"],
    }),
  ).toMatchObject({ source: "full" });
  expect(
    collectOrigins(r, data.packages, { available: false, files: [] }),
  ).toMatchObject({ source: "full" });
  expect(
    collectOrigins(r, data.packages, { available: true, files: [] }),
  ).toMatchObject({ origins: [] });
});
it("orders dependencies before callers, preserving edges around a cycle", () => {
  const result = deploymentOrder(
    ["web", "a", "b", "db"],
    [
      ["web", "a"],
      ["a", "b"],
      ["b", "a"],
      ["b", "db"],
    ],
  );
  expect(result.order.indexOf("db")).toBeLessThan(result.order.indexOf("a"));
  expect(result.order.indexOf("b")).toBeLessThan(result.order.indexOf("web"));
  expect(result.warnings).toEqual(["Service Binding cycle: a, b"]);
  expect(deploymentOrder([], [])).toEqual({ order: [], warnings: [] });
});

it("orders long chains without recursion and ignores outside and self edges", () => {
  const names = Array.from({ length: 12000 }, (_, i) => String(i));
  const edges: [string, string][] = names
    .slice(1)
    .map((name, i) => [String(i), name]);
  const result = deploymentOrder(names, [
    ...edges,
    ["0", "outside"],
    ["0", "0"],
  ]);
  expect(result.order).toEqual([...names].reverse());
  expect(result.warnings).toEqual([]);
});
