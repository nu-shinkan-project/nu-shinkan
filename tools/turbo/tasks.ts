import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { command } from "../command.js";
import { commandFailure, errorDetail } from "../diagnostics.js";

export type TurboTaskResult = {
  package: string;
  task: string;
  status: "passed" | "failed" | "execution-error";
  cached: boolean;
  reason?: string;
};
export type TurboRun = {
  status: "completed" | "failed";
  results: TurboTaskResult[];
  reason?: string;
};
export type TurboOptions = {
  only?: boolean;
  concurrency?: number;
  continue?: "always" | "dependencies-successful" | "never";
  args?: string[];
  env?: NodeJS.ProcessEnv;
};

type TaskSummary = {
  package?: unknown;
  task?: unknown;
  cache?: { status?: unknown };
  execution?: { exitCode?: unknown; error?: unknown };
};
export function collectTaskResults(
  summary: unknown,
  packages: string[],
  task: string,
): TurboTaskResult[] {
  const tasks = (summary as { tasks?: unknown })?.tasks;
  return packages.map((pkg) => {
    const base = { package: pkg, task, cached: false };
    if (!Array.isArray(tasks))
      return {
        ...base,
        status: "execution-error",
        reason: "Turbo summary unavailable",
      };
    const match: TaskSummary | undefined = tasks.find(
      (t) => t?.package === pkg && t?.task === task,
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

/** Capture the full task result, including dependency tasks, without choosing a consumer's reporting scope. */
export async function runTurbo(
  root: string,
  packages: string[],
  task: string,
  options: TurboOptions = {},
): Promise<TurboRun> {
  if (!packages.length) return { status: "completed", results: [] };
  const directory = resolve(root, ".turbo/runs");
  const before = new Set(existsSync(directory) ? readdirSync(directory) : []);
  const run = await command(
    "pnpm",
    [
      "exec",
      "turbo",
      "run",
      task,
      ...packages.map((p) => `--filter=${p}`),
      ...(options.only ? ["--only"] : []),
      ...(options.concurrency === undefined
        ? []
        : [`--concurrency=${options.concurrency}`]),
      ...(options.continue === undefined
        ? []
        : [`--continue=${options.continue}`]),
      "--summarize",
      "--output-logs=full",
      ...(options.args?.length ? ["--", ...options.args] : []),
    ],
    root,
    false,
    options.env ?? process.env,
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
  const tasks = (summary as { tasks?: unknown })?.tasks;
  const names = new Set(packages);
  if (Array.isArray(tasks))
    for (const entry of tasks)
      if (
        entry?.task === task &&
        typeof entry.package === "string" &&
        typeof entry.command === "string" &&
        entry.command
      )
        names.add(entry.package);
  const results = collectTaskResults(summary, [...names], task);
  const failure = [
    summaryFailure,
    ...(run.status !== "completed" || run.code !== 0
      ? [commandFailure(run, "Turbo")]
      : []),
  ]
    .filter(Boolean)
    .join("; ");
  const failed = Boolean(failure) || results.some((r) => r.status !== "passed");
  for (const result of results)
    if (result.status !== "passed" && failure)
      result.reason = `${result.reason}; ${failure}`;
  return {
    status: failed ? "failed" : "completed",
    results,
    ...(failure ? { reason: failure } : {}),
  };
}
