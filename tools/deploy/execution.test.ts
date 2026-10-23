import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Package } from "./types.js";
vi.mock("./command.js", () => ({ command: vi.fn() }));
import { command } from "./command.js";
import { checks, deploy } from "./tasks.js";
const run = vi.mocked(command);
const roots: string[] = [];
afterEach(() => {
  vi.resetAllMocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});
it("continues checks after failure and keeps results for every affected package", async () => {
  const root = mkdtempSync(join(tmpdir(), "deploy-checks-"));
  roots.push(root);
  mkdirSync(join(root, ".turbo/runs"), { recursive: true });
  const packages: Package[] = ["a", "b"].map((name) => ({
    name,
    path: `apps/${name}`,
    scripts: { test: "vitest", lint: "eslint", ui_test: "playwright" },
  }));
  let index = 0;
  run.mockImplementation(async (_program, args) => {
    const task = args[3]!;
    const tasks = packages.map((p) => ({
      package: p.name,
      task,
      execution: { exitCode: task === "test" && p.name === "a" ? 1 : 0 },
      cache: { status: "MISS" },
    }));
    writeFileSync(
      join(root, ".turbo/runs", `${++index}.json`),
      JSON.stringify({ tasks }),
    );
    return {
      status: "completed",
      code: task === "test" ? 1 : 0,
      stdout: "",
      stderr: "",
    };
  });
  const result = await checks(root, packages);
  expect(result.status).toBe("checks-failed");
  expect(result.results.map((r) => r.status)).toEqual([
    "failed",
    "passed",
    "passed",
    "passed",
    "passed",
    "passed",
  ]);
  expect(run.mock.calls.map((c) => c[1][3])).toEqual([
    "test",
    "lint",
    "ui_test",
  ]);
});
it("deploys serially in planned order and continues after failure", async () => {
  let active = 0;
  run.mockImplementation(async (_program, _args, path) => {
    active++;
    expect(active).toBe(1);
    await Promise.resolve();
    active--;
    return {
      status: "completed",
      code: path.endsWith("/api") ? 1 : 0,
      stdout: "https://web-preview-1.example.workers.dev",
      stderr: path.endsWith("/api")
        ? "Service Binding target missing: backend-preview-1"
        : "",
    };
  });
  const result = await deploy("/repo", [
    { name: "api", path: "apps/api", scripts: {} },
    { name: "web", path: "apps/web", scripts: {} },
  ]);
  expect(result.status).toBe("partial-failure");
  expect(result.results).toMatchObject([
    {
      package: "api",
      status: "deploy-failed",
      reason: expect.stringContaining(
        "Service Binding target missing: backend-preview-1",
      ),
    },
    {
      package: "web",
      status: "deployed",
      url: "https://web-preview-1.example.workers.dev",
    },
  ]);
});
