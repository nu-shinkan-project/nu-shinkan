import { errorDetail } from "../diagnostics.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { State, Check, Report } from "./types.js";
const escape = (value: string) =>
  value
    .replace(/[|\r\n]/g, " ")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
export function markdown(state: State): string {
  const { request, planning } = state;
  const lines = [
    `# Deploy: ${state.status}`,
    "",
    `Channel: ${request.channel}`,
    `Commit: ${request.commit}`,
    `Mode: ${request.purpose}/${request.source}`,
    "",
  ];
  if (state.stopped)
    lines.push(
      `Stopped at ${state.stopped.phase}: ${escape(state.stopped.reason)}`,
      "",
    );
  if (planning.status !== "planned") {
    lines.push(`Plan: ${escape(planning.reason)}`);
    if (planning.unknownPackages.length)
      lines.push(
        `Unknown packages: ${planning.unknownPackages.map(escape).join(", ")}`,
      );
    return lines.join("\n") + "\n";
  }
  const p = planning.plan;
  if (p.source !== p.initialSource)
    lines.push(
      `Final mode: ${request.purpose}/${p.source} (${escape(p.fallback ?? "")})`,
      "",
    );
  for (const warning of p.warnings) lines.push(`Warning: ${escape(warning)}`);
  if (!p.affected.length) lines.push("No check targets.");
  if (!p.deploys.length) lines.push("No deployment targets.");
  lines.push(
    "",
    "| Package | Membership | test | lint | ui_test | Build | Deploy |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const row of reportRows(state)) {
    const task = (cell: TaskCell) =>
      `${cell.status}${cell.cached ? " (cache)" : ""}`;
    const deployment = `${row.deploy.status}${row.deploy.url ? ` (${escape(row.deploy.url)})` : ""}`;
    lines.push(
      `| ${escape(row.package)} | ${row.membership} | ${[row.test, row.lint, row.ui_test, row.build].map(task).join(" | ")} | ${deployment} |`,
    );
  }
  for (const r of [
    ...(state.checks?.results ?? []),
    ...(state.builds?.results ?? []),
  ])
    if (r.reason)
      lines.push(
        "",
        `${escape(r.package)} / ${r.task} / ${r.status}: ${escape(r.reason)}`,
      );
  for (const r of state.deployments?.results ?? [])
    if (r.reason)
      lines.push("", `${escape(r.package)} / deploy: ${escape(r.reason)}`);
  if (state.configuration?.status === "configuration-failed")
    lines.push(
      "",
      `Configuration: ${escape(state.configuration.package ?? "")} ${escape(state.configuration.resource?.name ?? "")} ${escape(state.configuration.reason)}`,
    );
  return lines.join("\n") + "\n";
}
type TaskCell = { status: string; cached: boolean };
export type ReportRow = {
  package: string;
  membership: string;
  test: TaskCell;
  lint: TaskCell;
  ui_test: TaskCell;
  build: TaskCell;
  deploy: { status: string; url?: string };
};

/** Determine display values independently of Markdown formatting. */
export function reportRows(state: State): ReportRow[] {
  if (state.planning.status !== "planned") return [];
  const p = state.planning.plan;
  const names = new Set([
    ...p.affected,
    ...p.targets,
    ...(state.checks?.results ?? []).map((r) => r.package),
    ...(state.builds?.results ?? []).map((r) => r.package),
    ...(state.deployments?.results ?? []).map((r) => r.package),
  ]);
  const cell = (
    results: Check[] | undefined,
    name: string,
    task: string,
    selected: boolean,
  ): TaskCell => {
    const result = results?.find((r) => r.package === name && r.task === task);
    return result
      ? { status: result.status, cached: result.cached }
      : { status: selected ? "not run" : "out of scope", cached: false };
  };
  return [...names].map((name) => {
    const deployment = state.deployments?.results.find(
      (r) => r.package === name,
    );
    return {
      package: name,
      membership: p.targets.includes(name)
        ? "対象"
        : p.affected.includes(name)
          ? "影響下"
          : "",
      test: cell(
        state.checks?.results,
        name,
        "test",
        p.affected.includes(name),
      ),
      lint: cell(
        state.checks?.results,
        name,
        "lint",
        p.affected.includes(name),
      ),
      ui_test: cell(
        state.checks?.results,
        name,
        "ui_test",
        p.affected.includes(name),
      ),
      build: cell(
        state.builds?.results,
        name,
        "build",
        p.builds.includes(name),
      ),
      deploy: deployment
        ? { status: deployment.status, url: deployment.url }
        : { status: p.deploys.includes(name) ? "not run" : "out of scope" },
    };
  });
}

export async function report(state: State, path: string): Promise<Report> {
  return writeReport(markdown(state), path);
}
export async function writeReport(
  content: string,
  path: string,
): Promise<Report> {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return { status: "written", path };
  } catch (error) {
    return {
      status: "report-failed",
      reason: `Cannot write deployment report: ${errorDetail(error)}`,
    };
  }
}
