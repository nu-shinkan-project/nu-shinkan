import { afterEach, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runPlaceBackend } from "./place-backend.js";
import { runPlaceFrontend } from "./place-frontend.js";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});
it.each(["backend", "frontend"] as const)(
  "copies %s deployment configuration and replaces app name and local port",
  (kind) => {
    const root = mkdtempSync(join(tmpdir(), "scaffold-"));
    roots.push(root);
    const template = join(root, "template");
    mkdirSync(template);
    const original = `${kind}-template`;
    writeFileSync(
      join(template, "package.json"),
      JSON.stringify({
        name: `@repo/${original}`,
        scripts: { dev: "server --port 6173 --inspector-port 9229" },
      }),
    );
    writeFileSync(
      join(template, "wrangler.jsonc"),
      JSON.stringify({
        name: original,
        vars: { SELF: "http://localhost:6173" },
      }),
    );
    writeFileSync(
      join(template, ".env.development"),
      "VITE_SELF=http://localhost:5173\n",
    );
    writeFileSync(
      join(template, "deployment.yaml"),
      `envs:\n  staging:\n    SELF: https://${original}-staging.nushinkan2.workers.dev\nconnections:\n  urls:\n    SELF: '@repo/${original}'\nreviewEntry: ${kind === "frontend"}\n`,
    );
    const plan = {
      appKind: kind,
      appName: "new-app",
      targetDir: join(root, "app"),
      port: 7000,
      inspectorPort: 9300,
    };
    (kind === "backend" ? runPlaceBackend : runPlaceFrontend)(plan, template);
    expect(
      JSON.parse(readFileSync(join(plan.targetDir, "package.json"), "utf8")),
    ).toMatchObject({
      name: "@repo/new-app",
      scripts: { dev: expect.stringContaining("--port 7000") },
    });
    expect(
      readFileSync(join(plan.targetDir, "deployment.yaml"), "utf8"),
    ).toContain("new-app-staging");
    expect(
      readFileSync(join(plan.targetDir, "deployment.yaml"), "utf8"),
    ).toContain("@repo/new-app");
    expect(
      JSON.parse(readFileSync(join(plan.targetDir, "wrangler.jsonc"), "utf8"))
        .name,
    ).toBe("new-app");
    expect(
      readFileSync(
        join(
          plan.targetDir,
          kind === "frontend" ? ".env.development" : "wrangler.jsonc",
        ),
        "utf8",
      ),
    ).toContain("http://localhost:7000");
  },
);
