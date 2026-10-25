import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../command.js", () => ({ command: vi.fn() }));
vi.mock("../workspace/packages.js", async (original) => ({
  ...(await original<typeof import("../workspace/packages.js")>()),
  listPackages: vi.fn(),
  selectFilteredPackages: vi.fn(),
}));
const shared = vi.hoisted(() => ({ removeNull: vi.fn(), save: vi.fn() }));
vi.mock("@repo/app-config/global", () => ({
  GlobalRuntimeEnvsYaml: class {
    removeNull = shared.removeNull;
    save = shared.save;
    variablesFor() {
      return {};
    }
  },
}));
import { command } from "../command.js";
import { listPackages, selectFilteredPackages } from "../workspace/packages.js";
import { syncRepository } from "./repository.js";
import { inventory, finalizePlan, collectOrigins } from "../deploy/plan.js";
import { configure } from "../deploy/configure.js";
import type { Request } from "../deploy/types.js";
const roots: string[] = [];
afterEach(() => {
  roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true }));
  vi.resetAllMocks();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sync-connections-"));
  roots.push(root);
  const packages = ["web", "api-new", "api-old"].map((name) => ({
    name,
    path: `apps/${name}`,
    scripts: { "sync:local": "sync-local", build: "build" },
  }));
  for (const pkg of packages) {
    const path = join(root, pkg.path);
    mkdirSync(path, { recursive: true });
    writeFileSync(
      join(path, "wrangler.jsonc"),
      JSON.stringify({
        name: pkg.name,
        ...(pkg.name === "web"
          ? {
              services: [
                { binding: "API", service: "api-old", entrypoint: "Api" },
                { binding: "EXT", service: "external" },
              ],
              env: {
                staging: {
                  services: [
                    { binding: "API", service: "api-old", environment: "keep" },
                  ],
                },
                release: { services: [{ binding: "API", service: "api-old" }] },
              },
            }
          : {}),
      }),
    );
  }
  writeFileSync(
    join(root, "apps/web/deployment.yaml"),
    "reviewEntry: true\nconnections:\n  bindings:\n    API: api-new\n",
  );
  vi.mocked(listPackages).mockResolvedValue(packages);
  vi.mocked(selectFilteredPackages).mockImplementation(
    async (_r, all, filters) =>
      filters.length ? all.filter((p) => p.name === "web") : all,
  );
  vi.mocked(command).mockResolvedValue({
    status: "completed",
    code: 0,
    stdout: "",
    stderr: "",
  });
  return { root, packages, path: join(root, "apps/web/wrangler.jsonc") };
}
async function planning(
  root: string,
  channel: "preview" | "staging" | "release",
  affected = ["web", "api-new", "api-old"],
) {
  const context = {
    source: "full" as const,
    commit: "a",
    base: null,
    packages: [],
  };
  const request: Request =
    channel === "preview"
      ? {
          ...context,
          channel,
          purpose: "review",
          profile: "staging",
          prNumber: 7,
        }
      : channel === "release"
        ? {
            ...context,
            channel,
            purpose: "update",
            profile: "release",
            prNumber: -1,
          }
        : {
            ...context,
            channel,
            purpose: "update",
            profile: "staging",
            prNumber: -1,
          };
  const data = await inventory(root);
  const result = finalizePlan(
    request,
    data,
    collectOrigins(request, data.packages, { files: [], available: true }),
    affected,
  );
  if (result.status !== "planned") throw new Error(result.reason);
  return { plan: result.plan, request };
}
it.each(["staging", "release", "preview"] as const)(
  "keeps prediction, synchronization, order and generated %s binding on api-new",
  async (channel) => {
    const { root, packages, path } = fixture();
    const before = readFileSync(path, "utf8");
    const { plan, request } = await planning(root, channel);
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(plan.deploys.indexOf("api-new")).toBeLessThan(
      plan.deploys.indexOf("web"),
    );
    await syncRepository(root);
    const synced = JSON.parse(readFileSync(path, "utf8"));
    expect(synced.services).toEqual([
      { binding: "API", service: "api-new", entrypoint: "Api" },
      { binding: "EXT", service: "external" },
    ]);
    expect(synced.env.staging.services[0]).toEqual({
      binding: "API",
      service: "api-new",
      environment: "keep",
    });
    expect(synced.env.release.services[0].service).toBe("api-new");
    expect(
      await configure(
        root,
        plan,
        request,
        { account: "", token: "" },
        packages,
      ),
    ).toEqual({ status: "generated" });
    const generated = JSON.parse(
      readFileSync(join(root, "apps/web/wrangler.deploy.jsonc"), "utf8"),
    );
    expect(generated.services[0].service).toBe(
      `api-new-${channel === "preview" ? "preview-7" : channel}`,
    );
    expect(shared.save).toHaveBeenCalledTimes(1);
  },
);
it("keeps shared directives for filtered sync, resolving destination information from all packages", async () => {
  const { root, path } = fixture();
  await syncRepository(root, { filters: ["web"] });
  expect(JSON.parse(readFileSync(path, "utf8")).services[0].service).toBe(
    "api-new",
  );
  expect(shared.save).not.toHaveBeenCalled();
});
it("validates dry runs without writing either native or shared configuration", async () => {
  const { root, path } = fixture();
  const before = readFileSync(path, "utf8");
  await syncRepository(root, { dryRun: true });
  expect(readFileSync(path, "utf8")).toBe(before);
  expect(shared.save).not.toHaveBeenCalled();
});
it.each(["unknown", "no-worker", "missing-binding", "duplicate-worker"])(
  "preserves shared directives on invalid connections: %s",
  async (invalid) => {
    const { root, path } = fixture();
    if (invalid === "unknown")
      writeFileSync(
        join(root, "apps/web/deployment.yaml"),
        "connections:\n  bindings:\n    API: unknown\n",
      );
    if (invalid === "no-worker")
      rmSync(join(root, "apps/api-new/wrangler.jsonc"));
    if (invalid === "missing-binding") writeFileSync(path, '{"name":"web"}');
    if (invalid === "duplicate-worker")
      writeFileSync(
        join(root, "apps/api-old/wrangler.jsonc"),
        '{"name":"api-new"}',
      );
    const before = readFileSync(path, "utf8");
    await expect(syncRepository(root)).rejects.toThrow();
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(shared.save).not.toHaveBeenCalled();
  },
);
it("stops generation before lookup or saving if synchronization did not produce the planned connection", async () => {
  const { root, packages } = fixture();
  const { plan, request } = await planning(root, "staging");
  expect(
    await configure(root, plan, request, { account: "", token: "" }, packages),
  ).toMatchObject({
    status: "configuration-failed",
    reason: expect.stringContaining(
      "Connection configuration changed after planning",
    ),
  });
  expect(existsSync(join(root, "apps/web/wrangler.deploy.jsonc"))).toBe(false);
});
it("does not add an out-of-scope destination to deployment order and connects preview to staging", async () => {
  const { root } = fixture();
  const { plan } = await planning(root, "preview", ["web"]);
  expect(plan.deploys).toEqual(["web"]);
  expect(plan.connections.find((c) => c.name === "API")).toMatchObject({
    package: "api-new",
    worker: "api-new",
    channel: "staging",
  });
});

it("synchronizes bindings that exist only in profile overrides without creating a base services array", async () => {
  const { root, packages, path } = fixture();
  const native = JSON.parse(readFileSync(path, "utf8"));
  delete native.services;
  writeFileSync(path, JSON.stringify(native));
  const { plan, request } = await planning(root, "staging");
  await syncRepository(root);
  const saved = JSON.parse(readFileSync(path, "utf8"));
  expect(saved.services).toBeUndefined();
  expect(saved.env.staging.services[0].service).toBe("api-new");
  expect(saved.env.release.services[0].service).toBe("api-new");
  expect(
    await configure(root, plan, request, { account: "", token: "" }, packages),
  ).toEqual({ status: "generated" });
});
it("preserves variable edits made by child synchronization and allows variable changes after planning", async () => {
  const { root, packages, path } = fixture();
  const { plan, request } = await planning(root, "staging");
  vi.mocked(command).mockImplementation(async () => {
    const native = JSON.parse(readFileSync(path, "utf8"));
    native.vars = { KEEP: "synced" };
    writeFileSync(path, JSON.stringify(native));
    return { status: "completed", code: 0, stdout: "", stderr: "" };
  });
  await syncRepository(root);
  expect(JSON.parse(readFileSync(path, "utf8")).vars).toEqual({
    KEEP: "synced",
  });
  expect(
    await configure(root, plan, request, { account: "", token: "" }, packages),
  ).toEqual({ status: "generated" });
});
it("keeps URL review edges separate from undeclared native binding order constraints", async () => {
  const { root } = fixture();
  writeFileSync(
    join(root, "apps/web/deployment.yaml"),
    "connections:\n  urls:\n    API_URL: api-new\n",
  );
  const { plan } = await planning(root, "staging");
  expect(plan.connections.find((c) => c.kind === "url")).toMatchObject({
    package: "api-new",
  });
  expect(
    plan.connections.find((c) => c.kind === "binding" && c.name === "API"),
  ).toMatchObject({ package: "api-old" });
  expect(plan.deploys.indexOf("api-old")).toBeLessThan(
    plan.deploys.indexOf("web"),
  );
});
