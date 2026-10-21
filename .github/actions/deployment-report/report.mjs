import { existsSync, readFileSync } from "node:fs";

export async function publish({ github, context, core }) {
  const channel = process.env.REPORT_CHANNEL;
  const entry = process.env.REPORT_ENTRY;
  const steps = JSON.parse(process.env.REPORT_STEPS ?? "{}");
  const runUrl = `${process.env.GITHUB_SERVER_URL}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
  const path = ".artifacts/deploy-report.md";
  const hasReport = existsSync(path);
  core.info(
    `[notify] report=${hasReport ? "available" : "missing"}; CLI=${steps.execute?.outcome ?? "not run"}`,
  );
  const lines = [
    hasReport
      ? readFileSync(path, "utf8")
      : "# Deployment report unavailable\n\nThe CLI did not produce a report. Inspect the step results and run logs.",
    "",
    `[Actions run](${runUrl})`,
    "",
    "Workflow steps:",
  ];
  for (const [name, step] of Object.entries(steps))
    lines.push(`- ${name}: ${step.outcome ?? "unknown"}`);
  if (process.env.REPORT_UI_URL)
    lines.push("", `[UI test reports](${process.env.REPORT_UI_URL})`);
  if (entry === "manual-pick")
    lines.push("", "Usage: `/preview <exact-package-name> ...`");
  if (channel !== "preview" && steps.execute?.outcome !== "success")
    lines.push(
      "",
      `Recovery: run the **Full Deploy** workflow (update.full-deploy.yml) with channel ${channel}. It deploys the commit currently referenced by that tag without moving the tag. A later diff deployment does not guarantee recovery.`,
    );
  const body = lines.join("\n");
  if (channel === "preview") {
    const number = Number(process.env.REPORT_PR);
    if (!Number.isSafeInteger(number) || number <= 0)
      throw new Error("Invalid report PR number");
    await github.rest.issues.createComment({
      ...context.repo,
      issue_number: number,
      body,
    });
    core.info("[notify] PR report posted.");
  } else {
    await core.summary.addRaw(body).write();
    core.info("[notify] Job Summary written.");
  }
}
