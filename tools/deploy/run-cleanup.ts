import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
import { cleanup, cleanupMarkdown } from "./cleanup-operations.js";
import { writeReport } from "./report.js";
import { findWorkspaceRoot } from "../workspace/root.js";
export async function runCleanup(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      pr: { type: "string" },
      report: { type: "string", default: ".artifacts/deploy-report.md" },
    },
  });
  const path = resolve(findWorkspaceRoot(), values.report!);
  rmSync(path, { force: true });
  const prNumber = Number(values.pr);
  const result = await cleanup(prNumber, {
    account: env.CLOUDFLARE_ACCOUNT_ID ?? "",
    token: env.CLOUDFLARE_API_TOKEN ?? "",
  });
  const report = await writeReport(cleanupMarkdown(result, prNumber), path);
  console.log(
    `[cleanup] Result: ${result.status === "cleaned" ? result.outcome : result.status}; report: ${report.status}`,
  );
  return result.status === "cleaned" &&
    result.outcome === "success" &&
    report.status === "written"
    ? 0
    : 1;
}
