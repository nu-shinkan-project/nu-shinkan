import { expect, it } from "vitest";
import { resourcePatch } from "./resources.js";
it.each(["staging", "release"] as const)(
  "binds exact %s resource names without changing bindings or KV",
  (profile) => {
    const config = {
      name: "worker",
      d1_databases: [
        { binding: "DB", database_name: "data", database_id: "old" },
      ],
      r2_buckets: [{ binding: "FILES", bucket_name: "files" }],
      kv_namespaces: [{ binding: "KV", id: "explicit" }],
    };
    const result = {
      ...config,
      ...resourcePatch(
        config,
        profile,
        new Map([[`data-${profile}`, "resolved"]]),
      ),
    };
    expect(result.d1_databases).toEqual([
      {
        binding: "DB",
        database_name: `data-${profile}`,
        database_id: "resolved",
      },
    ]);
    expect(result.r2_buckets).toEqual([
      { binding: "FILES", bucket_name: `files-${profile}` },
    ]);
    expect(result.kv_namespaces).toEqual(config.kv_namespaces);
  },
);
it("rejects unresolved D1 instead of retaining another profile ID", () => {
  expect(() =>
    resourcePatch(
      {
        name: "worker",
        d1_databases: [
          { binding: "DB", database_name: "data", database_id: "wrong" },
        ],
      },
      "staging",
      new Map(),
    ),
  ).toThrow("Unresolved");
});
