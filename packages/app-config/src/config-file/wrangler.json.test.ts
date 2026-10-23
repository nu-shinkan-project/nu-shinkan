import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  WranglerJson,
  WranglerJsonc,
  type WranglerConfig,
  type WranglerPatch,
} from "./wrangler.jsonc.js";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});
function fixture(config: WranglerConfig) {
  const root = mkdtempSync(join(tmpdir(), "wrangler-model-"));
  roots.push(root);
  const content = "// keep source\n" + JSON.stringify(config, null, 2);
  writeFileSync(join(root, "wrangler.jsonc"), content);
  return { root, source: new WranglerJsonc(root), content };
}

it("derives edited state independently and replaces the destination as formatted JSON", () => {
  const { root, source, content } = fixture({
    name: "api",
    main: "src/index.ts",
  });
  source.update({ name: "edited" });
  const derived = source.derive("nested/output.jsonc");
  expect(existsSync(join(root, "nested/output.jsonc"))).toBe(false);
  source.update({ name: "source changed" });
  expect(derived.data.name).toBe("edited");
  derived.update({ vars: { A: "added" } });
  expect(source.variables).toEqual({});
  const snapshot = derived.data;
  snapshot.vars!.A = "external mutation";
  expect(derived.data.vars).toEqual({ A: "added" });
  vi.spyOn(console, "log").mockImplementation(() => {});
  derived.save(true);
  source.save(true);
  expect(existsSync(join(root, "nested/output.jsonc"))).toBe(false);
  derived.save();
  derived.update({ name: "replaced" });
  derived.save();
  expect(readFileSync(join(root, "nested/output.jsonc"), "utf8")).toBe(
    JSON.stringify(
      { name: "replaced", main: "src/index.ts", vars: { A: "added" } },
      null,
      2,
    ) + "\n",
  );
  expect(readFileSync(join(root, "wrangler.jsonc"), "utf8")).toBe(content);
  source.save();
  expect(readFileSync(join(root, "wrangler.jsonc"), "utf8")).toContain(
    "// keep source",
  );
});

it("flattens selected values before validating resources and preserves unrelated settings", () => {
  const { source } = fixture({
    name: "api",
    vars: { BASE: "keep", SHARED: "base" },
    route: "example.org",
    routes: ["other.org"],
    d1_databases: null,
    env: {
      staging: {
        vars: { SHARED: "selected" },
        d1_databases: [{ binding: "DB", database_name: "selected" }],
      },
      release: { d1_databases: false },
    },
  } as unknown as WranglerConfig);
  const model = source.derive("output.json");
  model.flattenEnv("staging");
  expect(model.data).toMatchObject({
    vars: { BASE: "keep", SHARED: "selected" },
    d1_databases: [{ database_name: "selected" }],
  });
  expect(model.data).not.toHaveProperty("env");
  model.useWorkersDev();
  expect(model.data).not.toHaveProperty("route");
  expect(model.data).not.toHaveProperty("routes");
  expect(model.data.workers_dev).toBe(true);
});

it.each<WranglerPatch>([
  {
    name: "updated",
    vars: { KEEP: "changed", DELETE: null, NEW: "added" },
    services: [
      { binding: "B", service: "new" },
      { binding: "C", service: "added" },
    ],
  },
  {
    name: undefined,
    vars: { ABSENT: null },
    services: [],
    untouched: undefined,
  },
  {
    env: { staging: { vars: { STAGE: "new" } } },
    d1_databases: [
      { binding: "DB", database_name: "replacement", extra: "kept" },
    ],
    custom: [1, 2],
  },
])("matches JSONC update semantics for %j", (values) => {
  const { source } = fixture({
    name: "api",
    vars: { KEEP: "keep", DELETE: "old" },
    services: [
      { binding: "A", service: "keep", extra: true },
      { binding: "B", service: "old", environment: "production" },
    ],
    env: { staging: { vars: { OLD: "old" } }, release: { name: "release" } },
    d1_databases: [{ binding: "DB", database_name: "base" }],
    untouched: "keep",
  });
  const model = source.derive("output.json");
  source.update(values);
  model.update(values);
  expect(model.data).toEqual(source.data);
});

it.each(["d1_databases", "r2_buckets"] as const)(
  "validates selected %s and isolates resource snapshots",
  (field) => {
    const name = field === "d1_databases" ? "database_name" : "bucket_name";
    for (const invalid of [
      null,
      false,
      {},
      [null],
      [[]],
      [1],
      [{}],
      [{ binding: "DB" }],
      [{ binding: "", [name]: "data" }],
      [{ binding: "DB", [name]: "  " }],
      [{ binding: 3, [name]: "data" }],
    ]) {
      const model = new WranglerJson("unused.json", {
        name: "api",
        env: { staging: { [field]: invalid } },
      } as unknown as WranglerConfig);
      model.flattenEnv("staging");
      expect(() => model.data).toThrow(field);
    }
    const model = new WranglerJson("unused.json", {
      name: "api",
      [field]: [{ binding: "DB", [name]: "data", extra: { enabled: true } }],
    });
    const snapshot = model.data[field]!;
    snapshot[0]!.binding = "changed";
    (snapshot[0]!.extra as { enabled: boolean }).enabled = false;
    expect(model.data[field]![0]).toEqual({
      binding: "DB",
      [name]: "data",
      extra: { enabled: true },
    });
    model.update({ [field]: null });
    expect(() => model.data).toThrow(field);
  },
);

it.each([{}, { d1_databases: [], r2_buckets: [] }])(
  "accepts omitted and empty resources: %j",
  (resources) => {
    const model = new WranglerJson("unused.json", {
      name: "api",
      ...resources,
    });
    model.flattenEnv("release");
    expect(model.data).toEqual({ name: "api", vars: {}, ...resources });
  },
);
