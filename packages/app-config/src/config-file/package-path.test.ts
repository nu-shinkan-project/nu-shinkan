import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { DeploymentYaml } from "./deployment.yaml.js";
import { Dotenv } from "./dotenv.js";
import { WranglerJsonc } from "./wrangler.jsonc.js";

vi.mock("node:process", () => ({ cwd: () => process.cwd() }));

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function fixture(name: string) {
  const root = mkdtempSync(join(tmpdir(), "config-file-"));
  roots.push(root);
  writeFileSync(
    join(root, "deployment.yaml"),
    `envs:\n  staging:\n    NAME: ${name}\n`,
  );
  writeFileSync(join(root, ".env.development"), `# keep\nVITE_NAME=${name}`);
  writeFileSync(join(root, "wrangler.jsonc"), JSON.stringify({ name }));
  return root;
}

it("keeps each instance bound to its package after cwd changes", () => {
  const first = fixture("first");
  const second = fixture("second");
  vi.spyOn(process, "cwd").mockReturnValue(first);
  const defaults = [
    new DeploymentYaml(),
    new Dotenv(),
    new WranglerJsonc(),
  ] as const;
  vi.spyOn(process, "cwd").mockReturnValue(second);
  const explicit = [
    new DeploymentYaml(first),
    new Dotenv(first),
    new WranglerJsonc(first),
  ] as const;
  for (const configs of [defaults, explicit]) {
    const [deployment, dotenv, wrangler] = configs;
    expect(deployment.envs.staging).toEqual({ NAME: "first" });
    expect(deployment.connections).toEqual({ bindings: {}, urls: {} });
    expect(deployment.reviewEntry).toBe(false);
    expect(dotenv.variables).toEqual({ NAME: "first" });
    expect(wrangler.name).toBe("first");
  }
  expect(new WranglerJsonc().name).toBe("second");
});

it("modifies and generates files only in the specified package", () => {
  const first = fixture("first");
  const second = fixture("second");
  vi.spyOn(process, "cwd").mockReturnValue(second);
  const dotenv = new Dotenv(first);
  const wrangler = new WranglerJsonc(first);
  dotenv.updateVariables({ NAME: "updated" });
  wrangler.update({ name: "updated" });
  expect(dotenv.variables.NAME).toBe("updated");
  expect(wrangler.name).toBe("updated");
  // 編集はメモリ上だけで行い、保存するまではファイルを変更しない。
  expect(new Dotenv(first).variables.NAME).toBe("first");
  expect(new WranglerJsonc(first).name).toBe("first");

  dotenv.rewriteOriginal();
  wrangler.rewriteOriginal();
  expect(new Dotenv(first).variables.NAME).toBe("updated");
  expect(new WranglerJsonc(first).name).toBe("updated");
  expect(readFileSync(join(first, ".env.development"), "utf8")).toContain(
    "# keep",
  );

  dotenv.updateVariables({ NAME: "deploy" });
  wrangler.update({ name: "deploy" });
  dotenv.genDeployment();
  wrangler.genDeployment();
  expect(readFileSync(join(first, ".env.production"), "utf8")).toBe(
    'VITE_NAME="deploy"',
  );
  expect(
    JSON.parse(readFileSync(join(first, "wrangler.deploy.jsonc"), "utf8")),
  ).toEqual({ name: "deploy" });
  expect(new Dotenv(first).variables.NAME).toBe("updated");
  expect(new WranglerJsonc(first).name).toBe("updated");
  expect(new Dotenv(second).variables.NAME).toBe("second");
  expect(new WranglerJsonc(second).name).toBe("second");
});

it("protects document state from mutations of returned values", () => {
  const root = fixture("original");
  const deployment = new DeploymentYaml(root);
  const dotenv = new Dotenv(root);
  const wrangler = new WranglerJsonc(root);
  deployment.envs.staging.NAME = "changed";
  dotenv.variables.NAME = "changed";
  wrangler.data.name = "changed";
  expect(deployment.envs.staging.NAME).toBe("original");
  expect(dotenv.variables.NAME).toBe("original");
  expect(wrangler.name).toBe("original");
});

it("composes variable updates before saving and retains comments", () => {
  const root = fixture("original");
  const dotenv = new Dotenv(root);
  dotenv.updateVariables({ NAME: null, ADDED: "first" });
  dotenv.updateVariables({ ADDED: "second", VITE_OTHER: "value" });
  expect(dotenv.variables).toEqual({ ADDED: "second", OTHER: "value" });
  dotenv.rewriteOriginal();
  expect(new Dotenv(root).variables).toEqual(dotenv.variables);
  expect(readFileSync(join(root, ".env.development"), "utf8")).toContain(
    "# keep",
  );
});

it("preserves raw quoted values when reading, updating, and rewriting", () => {
  const root = fixture("original");
  const values = {
    DOUBLE: '"hello world"',
    SINGLE: "'hello world'",
    ESCAPED: String.raw`"line\nvalue"`,
  };
  writeFileSync(
    join(root, ".env.development"),
    [
      "# keep",
      "PRIVATE=ignored",
      ...Object.entries(values).map(([key, value]) => `VITE_${key}=${value}`),
    ].join("\n"),
  );
  const dotenv = new Dotenv(root);
  expect(dotenv.variables).toEqual(values);
  dotenv.updateVariables({ ...dotenv.variables, ADDED: '"new value"' });
  dotenv.rewriteOriginal();
  expect(new Dotenv(root).variables).toEqual({
    ...values,
    ADDED: '"new value"',
  });
  expect(readFileSync(join(root, ".env.development"), "utf8")).toBe(
    [
      "# keep",
      "PRIVATE=ignored",
      'VITE_DOUBLE="hello world"',
      "VITE_SINGLE='hello world'",
      String.raw`VITE_ESCAPED="line\nvalue"`,
      'VITE_ADDED="new value"',
    ].join("\n"),
  );
});
