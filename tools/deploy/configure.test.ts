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
import { configure as generateConfiguration } from "./configure.js";
import type { Request, Plan } from "./types.js";
const configure = (
  root: string,
  plan: Plan,
  request: Request,
  credentials: { account: string; token: string },
) =>
  generateConfiguration(
    root,
    plan,
    request,
    credentials,
    ["a", "b"].map((name) => ({ name, path: `apps/${name}`, scripts: {} })),
  );
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

it.each(["preview", "staging", "release"] as const)(
  "uses selected %s resources, preserving attributes, order and native files",
  async (channel) => {
    const root = fixture();
    const profile = channel === "release" ? "release" : "staging";
    const originals = new Map<string, string>();
    for (const name of ["a", "b"]) {
      const config = {
        name,
        main: "src/worker.ts",
        assets: { directory: "./dist" },
        route: "example.org",
        routes: ["example.org/*"],
        d1_databases: null,
        r2_buckets: null,
        env: {
          [profile]: {
            name: "ignored-profile-name",
            d1_databases: [
              {
                binding: "DB",
                database_name: "shared",
                database_id: "old",
                migrations_dir: "migrations",
                extra: { keep: true },
              },
              { binding: "SECOND", database_name: "shared", extra: "second" },
            ],
            r2_buckets: [
              {
                binding: "FILES",
                bucket_name: "files",
                preview_bucket_name: "keep",
              },
            ],
          },
          [profile === "release" ? "staging" : "release"]: {
            d1_databases: false,
          },
        },
        kv_namespaces: [{ binding: "KV", id: "explicit" }],
      };
      const path = join(root, `apps/${name}/wrangler.jsonc`);
      const content = "// source comment\n" + JSON.stringify(config);
      writeFileSync(path, content);
      originals.set(path, content);
      writeFileSync(
        join(root, `apps/${name}/wrangler.deploy.jsonc`),
        '{"obsolete":true}',
      );
    }
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: [{ name: `shared-${profile}`, uuid: "resolved" }],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await configure(
        root,
        plan,
        { ...request, channel, profile },
        { account: "a", token: "t" },
      ),
    ).toEqual({ status: "generated" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (const name of ["a", "b"]) {
      const generated = JSON.parse(
        readFileSync(join(root, `apps/${name}/wrangler.deploy.jsonc`), "utf8"),
      );
      expect(generated.name).toBe(
        `${name}-${channel === "preview" ? "preview-12" : channel}`,
      );
      expect(generated.d1_databases).toEqual([
        {
          binding: "DB",
          database_name: `shared-${profile}`,
          database_id: "resolved",
          migrations_dir: "migrations",
          extra: { keep: true },
        },
        {
          binding: "SECOND",
          database_name: `shared-${profile}`,
          database_id: "resolved",
          extra: "second",
        },
      ]);
      expect(generated.r2_buckets).toEqual([
        {
          binding: "FILES",
          bucket_name: `files-${profile}`,
          preview_bucket_name: "keep",
        },
      ]);
      expect(generated).toMatchObject({
        main: "src/worker.ts",
        assets: { directory: "./dist" },
        kv_namespaces: [{ binding: "KV", id: "explicit" }],
      });
      expect(generated).not.toHaveProperty("env");
      expect(generated).not.toHaveProperty("obsolete");
      if (channel === "preview") {
        expect(generated).not.toHaveProperty("route");
        expect(generated).not.toHaveProperty("routes");
        expect(generated.workers_dev).toBe(true);
      } else {
        expect(generated.route).toBe("example.org");
        expect(generated.routes).toEqual(["example.org/*"]);
      }
    }
    for (const [path, content] of originals)
      expect(readFileSync(path, "utf8")).toBe(content);
  },
);

it.each([
  { d1_databases: null },
  { d1_databases: {} },
  { d1_databases: [null] },
  { d1_databases: [{ binding: "DB" }] },
  { d1_databases: [{ database_name: "shared" }] },
  { r2_buckets: null },
  { r2_buckets: "invalid" },
  { r2_buckets: [{ binding: "FILES", bucket_name: "" }] },
])(
  "rejects invalid selected resources before querying or saving: %j",
  async (resources) => {
    const root = fixture();
    writeFileSync(
      join(root, "apps/b/wrangler.jsonc"),
      JSON.stringify({ name: "b", env: { staging: resources } }),
    );
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      await configure(root, plan, request, { account: "a", token: "t" }),
    ).toMatchObject({ status: "configuration-failed", package: "b" });
    expect(fetcher).not.toHaveBeenCalled();
    for (const name of ["a", "b"]) {
      expect(existsSync(join(root, `apps/${name}/wrangler.deploy.jsonc`))).toBe(
        false,
      );
      expect(existsSync(join(root, `apps/${name}/.env.production`))).toBe(
        false,
      );
    }
  },
);

it("returns resource failures on API errors without falling back to an existing ID", async () => {
  const root = fixture();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("network unavailable")),
  );
  expect(
    await configure(root, plan, request, {
      account: "a",
      token: "test-api-token",
    }),
  ).toMatchObject({
    status: "configuration-failed",
    package: "a",
    resource: { kind: "D1", name: "shared-staging" },
    reason: expect.stringContaining("network unavailable"),
  });
  expect(existsSync(join(root, "apps/a/wrangler.deploy.jsonc"))).toBe(false);
});

it.each([{}, { d1_databases: [], r2_buckets: [] }])(
  "does not query D1 or invent omitted arrays: %j",
  async (resources) => {
    const root = fixture();
    for (const name of ["a", "b"])
      writeFileSync(
        join(root, `apps/${name}/wrangler.jsonc`),
        JSON.stringify({ name, ...resources }),
      );
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      await configure(root, plan, request, { account: "a", token: "t" }),
    ).toEqual({ status: "generated" });
    expect(fetcher).not.toHaveBeenCalled();
    const generated = JSON.parse(
      readFileSync(join(root, "apps/a/wrangler.deploy.jsonc"), "utf8"),
    );
    expect(generated.d1_databases).toEqual(resources.d1_databases);
    expect(generated.r2_buckets).toEqual(resources.r2_buckets);
  },
);

it.each(["preview", "staging", "release"] as const)(
  "combines native, profile and package settings for %s without changing sources",
  async (channel) => {
    const root = fixture();
    const profile = channel === "release" ? "release" : "staging";
    const source = {
      name: "a",
      main: "src/worker.ts",
      assets: { directory: "./dist" },
      vars: {
        NATIVE: "keep",
        SHARED: "native",
        API: "http://api.example:8080/api/?x=1",
      },
      env: {
        [profile]: {
          vars: { SHARED: "profile" },
          services: [
            { binding: "API", service: "native-b", environment: "keep" },
            { binding: "EXTERNAL", service: "native-external" },
          ],
        },
      },
    };
    const original = "// keep\n" + JSON.stringify(source);
    writeFileSync(join(root, "apps/a/wrangler.jsonc"), original);
    const dotenv =
      "# keep\nPRIVATE=ignored\nVITE_NATIVE=keep\nVITE_SHARED=native\nVITE_API=http://api.example:8080/api/?x=1";
    writeFileSync(join(root, "apps/a/.env.development"), dotenv);
    writeFileSync(join(root, "apps/a/.env.production"), "VITE_OBSOLETE=remove");
    writeFileSync(
      join(root, "apps/a/deployment.yaml"),
      `envs:\n  ${profile}:\n    SHARED: package\nconnections:\n  urls:\n    API: b\n  bindings:\n    API: b\n    EXTERNAL: unknown-package\n`,
    );
    // b is outside the generation targets but remains available for URL fallback.
    writeFileSync(join(root, "apps/b/wrangler.jsonc"), '{"name":"bare-b"}');
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const selected = {
      ...plan,
      targets: channel === "preview" ? ["a", "b"] : ["a"],
    };
    expect(
      await configure(
        root,
        selected,
        { ...request, channel, profile },
        { account: "a", token: "t" },
      ),
    ).toEqual({ status: "generated" });
    expect(fetcher).not.toHaveBeenCalled();
    const generated = JSON.parse(
      readFileSync(join(root, "apps/a/wrangler.deploy.jsonc"), "utf8"),
    );
    const url =
      channel === "preview"
        ? "https://bare-b-preview-12.nushinkan2.workers.dev/api/?x=1"
        : "http://api.example:8080/api/?x=1";
    expect(generated.vars).toEqual({
      NATIVE: "keep",
      SHARED: "package",
      API: url,
    });
    expect(generated.services).toEqual([
      {
        binding: "API",
        service:
          channel === "preview" ? "bare-b-preview-12" : `native-b-${profile}`,
        environment: "keep",
      },
      { binding: "EXTERNAL", service: `native-external-${profile}` },
    ]);
    expect(readFileSync(join(root, "apps/a/.env.production"), "utf8")).toBe(
      `VITE_NATIVE="keep"\nVITE_SHARED="package"\nVITE_API="${url}"`,
    );
    expect(readFileSync(join(root, "apps/a/wrangler.jsonc"), "utf8")).toBe(
      original,
    );
    expect(readFileSync(join(root, "apps/a/.env.development"), "utf8")).toBe(
      dotenv,
    );
    if (channel !== "preview")
      expect(existsSync(join(root, "apps/b/wrangler.deploy.jsonc"))).toBe(
        false,
      );
  },
);

it.each(["dotenv", "wrangler", "neither"])(
  "generates only existing native formats: %s",
  async (format) => {
    const root = fixture();
    rmSync(join(root, "apps/a/wrangler.jsonc"));
    rmSync(join(root, "apps/a/.env.development"));
    if (format === "dotenv")
      writeFileSync(join(root, "apps/a/.env.development"), "VITE_API=");
    if (format === "wrangler")
      writeFileSync(join(root, "apps/a/wrangler.jsonc"), '{"name":"a"}');
    writeFileSync(
      join(root, "apps/a/deployment.yaml"),
      "connections:\n  urls:\n    API: b\n",
    );
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      await configure(root, { ...plan, targets: ["a"] }, request, {
        account: "a",
        token: "t",
      }),
    ).toEqual({ status: "generated" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(existsSync(join(root, "apps/a/.env.production"))).toBe(
      format === "dotenv",
    );
    expect(existsSync(join(root, "apps/a/wrangler.deploy.jsonc"))).toBe(
      format === "wrangler",
    );
    expect(existsSync(join(root, "apps/b/wrangler.deploy.jsonc"))).toBe(false);
    if (format === "dotenv")
      expect(readFileSync(join(root, "apps/a/.env.production"), "utf8")).toBe(
        'VITE_API="https://b-staging.nushinkan2.workers.dev/"',
      );
    if (format === "wrangler")
      expect(
        JSON.parse(
          readFileSync(join(root, "apps/a/wrangler.deploy.jsonc"), "utf8"),
        ).vars.API,
      ).toBe("https://b-staging.nushinkan2.workers.dev/");
  },
);

it("returns connection errors with the package name", async () => {
  const root = fixture();
  writeFileSync(join(root, "apps/a/wrangler.jsonc"), '{"name":"a"}');
  writeFileSync(
    join(root, "apps/a/deployment.yaml"),
    "connections:\n  bindings:\n    MISSING: b\n",
  );
  expect(
    await configure(root, { ...plan, targets: ["a"] }, request, {
      account: "a",
      token: "test-token",
    }),
  ).toMatchObject({
    status: "configuration-failed",
    package: "a",
    reason: expect.stringContaining("Missing native binding"),
  });
  expect(existsSync(join(root, "apps/a/wrangler.deploy.jsonc"))).toBe(false);
});
