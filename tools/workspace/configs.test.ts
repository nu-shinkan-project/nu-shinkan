import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { getWorkspaceConfigurations, workerMapping } from "./configs.js";
import { findWorkspaceRoot } from "./root.js";

const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "workspace-configs-"));
  roots.push(root);
  writeFileSync(
    join(root, "pnpm-workspace.yaml"),
    'packages: ["apps/*", "!apps/excluded"]',
  );
  for (const name of ["api", "web", "excluded"]) {
    mkdirSync(join(root, "apps", name), { recursive: true });
    writeFileSync(
      join(root, "apps", name, "package.json"),
      JSON.stringify({ name }),
    );
  }
  writeFileSync(
    join(root, "apps/api/wrangler.jsonc"),
    '{/* native */ "name":"my-api","vars":{"FOO":"bar"}}',
  );
  writeFileSync(
    join(root, "apps/web/.env.development"),
    "PRIVATE=secret\nVITE_API=https://example.com\n",
  );
  return root;
}
it("loads native settings from the supplied workspace inventory", () => {
  const root = fixture();
  expect(findWorkspaceRoot(join(root, "apps/api"))).toBe(root);
  const configurations = getWorkspaceConfigurations(
    root,
    ["api", "web"].map((name) => ({ name, path: `apps/${name}`, scripts: {} })),
  );
  expect(configurations.map((pkg) => pkg.packageName)).toEqual(["api", "web"]);
  expect(configurations[0]?.wrangler?.name).toBe("my-api");
  expect(configurations[1]).toMatchObject({
    packageName: "web",
    path: join(root, "apps/web"),
    pathRel: "apps/web",
    dotenv: { API: "https://example.com" },
  });
});
it("rejects ambiguous Worker identities", () => {
  const root = fixture();
  writeFileSync(join(root, "apps/web/wrangler.jsonc"), '{"name":"my-api"}');
  expect(() =>
    workerMapping(
      getWorkspaceConfigurations(
        root,
        ["api", "web"].map((name) => ({
          name,
          path: `apps/${name}`,
          scripts: {},
        })),
      ),
    ),
  ).toThrow("Duplicate Worker name");
});
