import { selectPackages } from "../workspace/packages.js";
import { syncRepository } from "../sync-env/repository.js";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
import { findWorkspaceRoot } from "../workspace/root.js";
import { commandFailure } from "../diagnostics.js";
import { command } from "../command.js";
import { plan } from "./plan.js";
import { configure } from "./configure.js";
import { build, deploy } from "./tasks.js";
import { checks } from "../checking/checks.js";
import { report } from "./report.js";
import { orchestrate } from "./orchestrate.js";
import type { Request } from "./types.js";
export type Entry = "update" | "full" | "review" | "manual-pick";
export function parseRequest(
  entry: Entry,
  args: string[],
): { request: Request; reportPath: string } {
  const { values } = parseArgs({
    args,
    options: {
      channel: { type: "string" },
      commit: { type: "string" },
      base: { type: "string" },
      pr: { type: "string" },
      package: { type: "string", multiple: true },
      report: { type: "string", default: ".artifacts/deploy-report.md" },
    },
  });
  const channel = values.channel;
  const review = entry === "review" || entry === "manual-pick";
  if (
    review
      ? channel !== "preview"
      : channel !== "staging" && channel !== "release"
  )
    throw new Error("Invalid channel for entry point");
  if (!values.commit || !/^[a-f0-9]{40}$/.test(values.commit))
    throw new Error("Target commit must be a full SHA");
  let base = values.base ?? null;
  if (base && /^0+$/.test(base)) base = null;
  if (base && !/^[a-f0-9]{40}$/.test(base))
    throw new Error("Base must be a full SHA");
  const prNumber = review ? Number(values.pr) : -1;
  if (review && (!Number.isSafeInteger(prNumber) || prNumber <= 0))
    throw new Error("PR number must be a positive integer");
  if (entry === "review" && !base) throw new Error("Review base is required");
  const packages = values.package ?? [];
  if (
    entry === "manual-pick" &&
    (!packages.length ||
      packages.some(
        (p) => !/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i.test(p),
      ))
  )
    throw new Error("Specify exact package names");
  return {
    request: {
      channel: channel as Request["channel"],
      purpose: review ? "review" : "update",
      profile: channel === "release" ? "release" : "staging",
      source:
        entry === "full"
          ? "full"
          : entry === "manual-pick"
            ? "manual-pick"
            : "diff",
      commit: values.commit,
      base,
      prNumber,
      packages,
    },
    reportPath: values.report!,
  };
}
export async function run(entry: Entry, args: string[]): Promise<number> {
  const { request, reportPath } = parseRequest(entry, args);
  const root = findWorkspaceRoot();
  const path = resolve(root, reportPath);
  rmSync(path, { force: true });
  const actual = await command("git", ["rev-parse", "HEAD"], root, true);
  if (actual.status !== "completed" || actual.code !== 0)
    throw new Error(commandFailure(actual, "Cannot inspect checkout"));
  if (actual.stdout.trim() !== request.commit)
    throw new Error("Checkout does not match the requested commit");
  const credentials = {
    account: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    token: process.env.CLOUDFLARE_API_TOKEN ?? "",
  };
  const outcome = await orchestrate(request, {
    plan: async (r) => {
      console.log(
        `[deploy] Plan: ${r.channel} ${r.purpose}/${r.source} ${r.commit}`,
      );
      const result = await plan(r, root);
      if (result.status === "planned") {
        console.log(
          `[deploy] affected=${result.plan.affected.join(", ")} targets=${result.plan.targets.join(", ")} order=${result.plan.deploys.join(", ")}`,
        );
      }
      return result;
    },
    sync: async () => {
      console.log("[deploy] Sync");
      try {
        await syncRepository(root);
        return { status: "synced" };
      } catch (error) {
        return {
          status: "sync-failed",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
    checks: (p, context) =>
      checks(root, selectPackages([...context.packages.values()], p.affected)),
    configure: async (p, r) => {
      console.log("[deploy] Generate configuration");
      return configure(root, p, r, credentials);
    },
    build: (p, context) =>
      build(root, selectPackages([...context.packages.values()], p.builds)),
    deploy: (p, context) =>
      deploy(
        root,
        p.deploys.map((name) => {
          const pkg = context.packages.get(name);
          if (!pkg) throw new Error(`Missing execution package: ${name}`);
          return pkg;
        }),
      ),
    report: (state) => report(state, path),
  });
  console.log(
    `[deploy] Result: ${outcome.state.status}; report: ${outcome.report.status}`,
  );
  if (outcome.report.status === "report-failed")
    console.error(outcome.report.reason);
  return outcome.exitCode;
}
