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
  const names = new Set([
    ...p.affected,
    ...p.targets,
    ...(state.checks?.results ?? []).map((r) => r.package),
    ...(state.builds?.results ?? []).map((r) => r.package),
    ...(state.deployments?.results ?? []).map((r) => r.package),
  ]);
  lines.push(
    "",
    "| Package | Membership | test | lint | ui_test | Build | Deploy |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );
  const check = (
    results: Check[] | undefined,
    name: string,
    task: string,
    selected: boolean,
  ) => {
    const r = results?.find((r) => r.package === name && r.task === task);
    return r
      ? `${r.status}${r.cached ? " (cache)" : ""}`
      : selected
        ? "not run"
        : "out of scope";
  };
  for (const name of names) {
    const d = state.deployments?.results.find((r) => r.package === name);
    lines.push(
      `| ${escape(name)} | ${p.targets.includes(name) ? "対象" : p.affected.includes(name) ? "影響下" : ""} | ${["test", "lint", "ui_test"].map((t) => check(state.checks?.results, name, t, p.affected.includes(name))).join(" | ")} | ${check(state.builds?.results, name, "build", p.builds.includes(name))} | ${d ? `${d.status}${d.url ? ` (${escape(d.url)})` : ""}` : p.deploys.includes(name) ? "not run" : "out of scope"} |`,
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
