import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { configure } from "./configure.js";
import type { Request, Plan } from "./types.js";
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "deploy-configure-"));
  roots.push(root);
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  for (const name of ["a", "b"]) {
    const dir = join(root, "apps", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name }));
    writeFileSync(join(dir, ".env.development"), "VITE_KEEP=native");
    writeFileSync(
      join(dir, "wrangler.jsonc"),
      JSON.stringify({
        name,
        d1_databases: [
          {
            binding: "DB",
            database_name: "shared",
            database_id: "wrong-profile",
          },
        ],
        r2_buckets: [{ binding: "FILES", bucket_name: "files" }],
        kv_namespaces: [{ binding: "KV", id: "explicit" }],
      }),
    );
  }
  return root;
}
const plan: Plan = {
  initialSource: "full",
  source: "full",
  origins: ["a", "b"],
  affected: ["a", "b"],
  targets: ["a", "b"],
  builds: [],
  deploys: ["a", "b"],
  warnings: [],
};
const request: Request = {
  channel: "preview",
  profile: "staging",
  purpose: "review",
  source: "full",
  commit: "sha",
  base: null,
  prNumber: 12,
  packages: [],
};
it("reuses a single resource listing and materializes preview with staging resources", async () => {
  const root = fixture();
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        success: true,
        result: [{ name: "shared-staging", uuid: "correct" }],
      }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(
    await configure(root, plan, request, { account: "a", token: "t" }),
  ).toEqual({ status: "generated" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const generated = JSON.parse(
    readFileSync(join(root, "apps/a/wrangler.deploy.jsonc"), "utf8"),
  );
  expect(generated).toMatchObject({
    name: "a-preview-12",
    d1_databases: [
      {
        binding: "DB",
        database_name: "shared-staging",
        database_id: "correct",
      },
    ],
    r2_buckets: [{ bucket_name: "files-staging" }],
    kv_namespaces: [{ id: "explicit" }],
  });
  expect(readFileSync(join(root, "apps/a/.env.production"), "utf8")).toContain(
    'VITE_KEEP="native"',
  );
});
it.each([
  { databases: [] },
  {
    databases: [
      { name: "shared-staging", uuid: "1" },
      { name: "shared-staging", uuid: "2" },
    ],
  },
])(
  "retains resource and package details on failed lookup",
  async ({ databases }) => {
    const root = fixture();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: true, result: databases })),
        ),
    );
    expect(
      await configure(root, plan, request, { account: "a", token: "t" }),
    ).toMatchObject({
      status: "configuration-failed",
      package: "a",
      resource: { kind: "D1", name: "shared-staging" },
    });
    expect(existsSync(join(root, "apps/a/wrangler.deploy.jsonc"))).toBe(false);
  },
);
