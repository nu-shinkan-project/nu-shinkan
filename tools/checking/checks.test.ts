import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Package } from "./types.js";
vi.mock("../command.js", () => ({ command: vi.fn() }));
import { command } from "../command.js";
import { checks } from "./checks.js";
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

it("blocks UI tests with failed preparation, continues other workspaces, and excludes stale reports", async () => {
  const root = mkdtempSync(join(tmpdir(), "checking-ui-"));
  roots.push(root);
  mkdirSync(join(root, ".turbo/runs"), { recursive: true });
  const packages: Package[] = ["a", "b"].map((name) => ({
    name,
    path: `apps/${name}`,
    scripts: { ui_test: "playwright", "ui_test:prepare": "prepare" },
  }));
  for (const path of [
    "apps/a/playwright-report",
    ".artifacts/ui_test-reports/apps/old",
  ]) {
    mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path, "index.html"), "stale");
  }
  let index = 0;
  run.mockImplementation(async (_program, args) => {
    const task = args[3]!;
    const tasks = (task === "ui_test:prepare" ? packages : [packages[1]!]).map(
      (pkg) => ({
        package: pkg.name,
        task,
        execution: { exitCode: pkg.name === "a" ? 1 : 0 },
      }),
    );
    if (task === "ui_test") {
      mkdirSync(join(root, "apps/b/playwright-report"), { recursive: true });
      writeFileSync(
        join(root, "apps/b/playwright-report/index.html"),
        "current",
      );
    }
    writeFileSync(
      join(root, ".turbo/runs", `${++index}.json`),
      JSON.stringify({ tasks }),
    );
    return {
      status: "completed",
      code: task === "ui_test:prepare" ? 1 : 0,
      stdout: "",
      stderr: "",
    };
  });
  const result = await checks(root, packages, ["ui_test"]);
  expect(result.status).toBe("checks-failed");
  expect(result.results).toMatchObject([
    { package: "a", task: "ui_test:prepare", status: "failed" },
    { package: "b", task: "ui_test:prepare", status: "passed" },
    { package: "a", task: "ui_test", status: "execution-error" },
    { package: "b", task: "ui_test", status: "passed" },
  ]);
  expect(existsSync(join(root, ".artifacts/ui_test-reports/apps/a"))).toBe(
    false,
  );
  expect(existsSync(join(root, ".artifacts/ui_test-reports/apps/old"))).toBe(
    false,
  );
  expect(
    readFileSync(
      join(root, ".artifacts/ui_test-reports/apps/b/index.html"),
      "utf8",
    ),
  ).toBe("current");
});

it("does not run tasks when the selected set is empty", async () => {
  expect(await checks("/unused", [])).toEqual({
    status: "passed",
    results: [],
  });
  expect(run).not.toHaveBeenCalled();
});
