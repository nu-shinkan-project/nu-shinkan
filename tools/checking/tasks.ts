import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { command } from "../command.js";
import { commandFailure, errorDetail } from "../diagnostics.js";
import type { Package, Check } from "./types.js";

type TaskSummary = {
  package?: unknown;
  task?: unknown;
  cache?: { status?: unknown };
  execution?: { exitCode?: unknown; error?: unknown };
};
export function collectTaskResults(
  summary: unknown,
  packages: Package[],
  task: string,
): Check[] {
  const tasks = (summary as { tasks?: unknown })?.tasks;
  return packages.map((pkg) => {
    const base = { package: pkg.name, task, cached: false };
    if (!pkg.scripts[task]) return { ...base, status: "no-script" };
    if (!Array.isArray(tasks))
      return {
        ...base,
        status: "execution-error",
        reason: "Turbo summary unavailable",
      };
    const match: TaskSummary | undefined = tasks.find(
      (t) => t?.package === pkg.name && t?.task === task,
    );
    if (!match)
      return {
        ...base,
        status: "execution-error",
        reason: "Task missing from Turbo summary",
      };
    const cached = match.cache?.status === "HIT";
    const code = match.execution?.exitCode;
    if (code === 0 || (cached && code === undefined))
      return { ...base, status: "passed", cached };
    if (typeof code === "number")
      return {
        ...base,
        status: "failed",
        reason: `${task} exited ${code}; see execution log`,
      };
    return {
      ...base,
      status: "execution-error",
      reason: `Task completion could not be confirmed${match.execution?.error ? `: ${errorDetail(match.execution.error)}` : ""}`,
    };
  });
}
export async function turboTask(
  root: string,
  packages: Package[],
  task: string,
  only: boolean,
): Promise<Check[]> {
  if (!packages.length) {
    console.log(`[checking] ${task}: no selected workspaces`);
    return [];
  }
  const registered = packages.filter((p) => p.scripts[task]);
  if (!registered.length) {
    console.log(
      `[checking] ${task}: ${packages.length} selected workspaces have no registered script`,
    );
    return collectTaskResults({ tasks: [] }, packages, task);
  }
  const directory = resolve(root, ".turbo/runs");
  const before = new Set(existsSync(directory) ? readdirSync(directory) : []);
  console.log(
    `[checking] ${task}: ${registered.map((p) => p.name).join(", ")}`,
  );
  const run = await command(
    "pnpm",
    [
      "exec",
      "turbo",
      "run",
      task,
      ...registered.map((p) => `--filter=${p.name}`),
      ...(only ? ["--only"] : []),
      "--concurrency=1",
      "--continue=always",
      "--summarize",
      "--output-logs=full",
      ...(task === "test" ? ["--", "--run"] : []),
    ],
    root,
    false,
    task === "build" ? process.env : { ...process.env, TEST: "PACKAGE" },
  );
  let summary: unknown;
  let summaryFailure: string | undefined;
  try {
    const files = readdirSync(directory).filter(
      (f) => f.endsWith(".json") && !before.has(f),
    );
    if (files.length === 1)
      summary = JSON.parse(readFileSync(resolve(directory, files[0]!), "utf8"));
    else
      summaryFailure = `Expected one new Turbo summary, found ${files.length}`;
  } catch (error) {
    summaryFailure = `Cannot read Turbo summary: ${errorDetail(error)}`;
  }
  const reported = [...packages];
  if (task === "build") {
    const tasks = (
      summary as {
        tasks?: { package?: unknown; command?: unknown; task?: unknown }[];
      }
    )?.tasks;
    if (Array.isArray(tasks))
      for (const t of tasks) {
        if (
          t.task === task &&
          typeof t.package === "string" &&
          typeof t.command === "string" &&
          t.command &&
          !reported.some((p) => p.name === t.package)
        )
          reported.push({
            name: t.package,
            path: "",
            scripts: { build: t.command },
          });
      }
  }
  const results = collectTaskResults(summary, reported, task);
  // A dependency may fail outside the requested set during builds.
  if (run.status !== "completed" || run.code !== 0) {
    if (
      !results.some(
        (r) => r.status === "failed" || r.status === "execution-error",
      )
    ) {
      const first = results.find((r) => r.status === "passed");
      if (first) {
        first.status = "execution-error";
        first.reason = "Turbo or a dependency failed";
      }
    }
  }
  for (const result of results) {
    if (result.status === "failed" || result.status === "execution-error") {
      if (summaryFailure) result.reason += `; ${summaryFailure}`;
      if (run.status !== "completed" || run.code !== 0)
        result.reason += `; ${commandFailure(run, "Turbo")}`;
    }
  }
  for (const result of results)
    console.log(
      `[checking] ${result.package} ${task}: ${result.status}${result.cached ? " (cache)" : ""}${result.reason ? `; ${result.reason}` : ""}`,
    );
  return results;
}
