import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { testExports } from "@repo/app-config/deployment";
import { ConnectionGraph } from "./graph.js";

it("selects every entry path, including cycles, but not unrelated dependencies", () => {
  const names = ["api", "a", "b", "web", "other", "batch", "orphan"];
  const graph = ConnectionGraph.fromDeployments(
    names,
    new Map([
      [
        "api",
        testExports.asDeployment({
          connections: { urls: { SELF: "api", X: "missing" } },
        }),
      ],
      [
        "a",
        testExports.asDeployment({
          connections: { urls: { API: "api", B: "b" } },
        }),
      ],
      [
        "b",
        testExports.asDeployment({ connections: { bindings: { A: "a" } } }),
      ],
      [
        "web",
        testExports.asDeployment({
          reviewEntry: true,
          connections: {
            bindings: { A: "a", B: "b" },
            urls: { A: "a", OTHER: "other" },
          },
        }),
      ],
      [
        "batch",
        testExports.asDeployment({ connections: { urls: { API: "api" } } }),
      ],
    ]),
  );
  expect(
    graph.toJSON().edges.filter(([from, to]) => from === "web" && to === "a"),
  ).toHaveLength(1);
  expect(graph.toJSON().edges).not.toContainEqual(["api", "api"]);
  expect(graph.toJSON().edges).not.toContainEqual(["api", "missing"]);
  expect(graph.selectReviewTargets(["api", "orphan", "api"])).toEqual([
    "api",
    "a",
    "b",
    "web",
  ]);
  expect(graph.selectReviewTargets(["web"])).toEqual(["web"]);
  expect(graph.selectReviewTargets([])).toEqual([]);
  expect(graph.selectReviewTargets(["orphan", "unknown"])).toEqual([]);
  expect(
    ConnectionGraph.fromJSON({
      ...graph.toJSON(),
      reviewEntries: [],
    }).selectReviewTargets(names),
  ).toEqual([]);
  expect(
    ConnectionGraph.fromJSON(
      JSON.parse(JSON.stringify(graph)),
    ).selectReviewTargets(["api"]),
  ).toEqual(graph.selectReviewTargets(["api"]));
});

it("reads workspace configuration, missing deployment files, and exclusions", () => {
  const root = mkdtempSync(join(tmpdir(), "connection-graph-"));
  try {
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      'packages:\n  - "apps/*"\n  - "!apps/excluded"\n',
    );
    for (const name of ["api", "web", "shared", "excluded"]) {
      mkdirSync(join(root, "apps", name), { recursive: true });
      writeFileSync(
        join(root, "apps", name, "package.json"),
        JSON.stringify({ name }),
      );
    }
    writeFileSync(
      join(root, "apps/web/deployment.yaml"),
      "reviewEntry: true\nconnections:\n  urls:\n    API: api\n",
    );
    const graph = ConnectionGraph.fromWorkspace(root);
    expect(graph.toJSON().packages).toEqual(["api", "shared", "web"]);
    expect(graph.selectReviewTargets(["api"])).toEqual(["api", "web"]);
    writeFileSync(
      join(root, "apps/web/deployment.yaml"),
      "connections:\n  urls: []\n",
    );
    expect(() => ConnectionGraph.fromWorkspace(root)).toThrow(
      "expected mapping",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("handles long paths without recursive stack overflow", () => {
  const packages = Array.from({ length: 20000 }, (_, i) => String(i));
  const edges: [string, string][] = packages
    .slice(1)
    .map((p, i) => [p, String(i)]);
  expect(
    ConnectionGraph.fromJSON({
      packages,
      edges,
      reviewEntries: ["19999"],
    }).selectReviewTargets(["0"]),
  ).toHaveLength(20000);
});

it("isolates its graph from input, serialized output, and selected result mutations", () => {
  const data = {
    packages: ["api", "web"],
    edges: [["web", "api"]],
    reviewEntries: ["web"],
  };
  const graph = ConnectionGraph.fromJSON(data);
  data.edges.length = 0;
  graph.toJSON().packages.length = 0;
  graph.selectReviewTargets(["api"])[0] = "changed";
  expect(graph.selectReviewTargets(["api"])).toEqual(["api", "web"]);
});

it.each([
  null,
  {},
  { packages: "api", edges: [], reviewEntries: [] },
  { packages: [""], edges: [], reviewEntries: [] },
  { packages: [1], edges: [], reviewEntries: [] },
  { packages: [], edges: {}, reviewEntries: [] },
  { packages: ["api"], edges: [null], reviewEntries: [] },
  { packages: ["api"], edges: [["api"]], reviewEntries: [] },
  { packages: ["api"], edges: [["api", "api", "api"]], reviewEntries: [] },
  { packages: ["api"], edges: [["api", 1]], reviewEntries: [] },
  { packages: [], edges: [], reviewEntries: "api" },
  { packages: [], edges: [], reviewEntries: [null] },
])("rejects invalid graph structure: %j", (value) => {
  expect(() => ConnectionGraph.fromJSON(value)).toThrow(
    "Invalid connection graph",
  );
});

it("rejects duplicate package names in graph input", () => {
  expect(() =>
    ConnectionGraph.fromJSON({
      packages: ["api", "api"],
      edges: [],
      reviewEntries: [],
    }),
  ).toThrow("Duplicate workspace package name");
});
