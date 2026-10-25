import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { errorDetail } from "../diagnostics.js";
import { turboTask } from "./tasks.js";
import type { Check, Checks } from "./types.js";
import type { Package } from "../workspace/types.js";

export const checkTasks = ["test", "lint", "ui_test"] as const;
export type CheckTask = (typeof checkTasks)[number];

export async function checks(
  root: string,
  packages: Package[],
  tasks: readonly CheckTask[] = checkTasks,
): Promise<Checks> {
  const results: Check[] = [];
  for (const task of tasks) {
    if (task !== "ui_test") {
      results.push(...(await turboTask(root, packages, task)));
      continue;
    }
    const uiPackages = packages.filter((p) => p.scripts.ui_test);
    // Remove reports from earlier runs, including unselected workspaces.
    rmSync(resolve(root, ".artifacts/ui_test-reports"), {
      recursive: true,
      force: true,
    });
    for (const pkg of uiPackages) {
      rmSync(resolve(root, pkg.path, "playwright-report"), {
        recursive: true,
        force: true,
      });
    }
    const preparation = await turboTask(root, uiPackages, "ui_test:prepare");
    results.push(...preparation.filter((r) => r.status !== "no-script"));
    const blocked = new Set(preparation.filter(failed).map((r) => r.package));
    results.push(
      ...packages
        .filter((p) => blocked.has(p.name))
        .map((pkg): Check => ({
          package: pkg.name,
          task,
          status: "execution-error",
          cached: false,
          reason: "UI environment preparation failed; tests were not run",
        })),
    );
    results.push(
      ...(await turboTask(
        root,
        packages.filter((p) => !blocked.has(p.name)),
        task,
      )),
    );
    for (const pkg of uiPackages) {
      const source = resolve(root, pkg.path, "playwright-report");
      if (!existsSync(source)) continue;
      try {
        const destination = resolve(
          root,
          ".artifacts/ui_test-reports",
          pkg.path,
        );
        mkdirSync(destination, { recursive: true });
        cpSync(source, destination, { recursive: true });
      } catch (error) {
        results.push({
          package: pkg.name,
          task: "ui_test:report",
          status: "execution-error",
          cached: false,
          reason: `Cannot collect UI report: ${errorDetail(error)}`,
        });
      }
    }
  }
  return { status: results.some(failed) ? "checks-failed" : "passed", results };
}

function failed(result: Check): boolean {
  return result.status === "failed" || result.status === "execution-error";
}
