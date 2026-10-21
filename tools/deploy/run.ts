import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
import { findWorkspaceRoot } from "../workspace/root.js";
import { command } from "./command.js";
import { plan, inventory } from "./plan.js";
import { configure } from "./configure.js";
import { checks, build, deploy } from "./tasks.js";
import { report } from "./report.js";
import { orchestrate } from "./orchestrate.js";
import type { Request, Package } from "./types.js";
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
  if (
    actual.status !== "completed" ||
    actual.code !== 0 ||
    actual.stdout.trim() !== request.commit
  )
    throw new Error("Checkout does not match the requested commit");
  const credentials = {
    account: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    token: process.env.CLOUDFLARE_API_TOKEN ?? "",
  };
  let packages: Package[] = [];
  const select = (names: string[]) =>
    names.map((n) => packages.find((p) => p.name === n)!);
  const outcome = await orchestrate(request, {
    plan: async (r) => {
      console.log(
        `[deploy] Plan: ${r.channel} ${r.purpose}/${r.source} ${r.commit}`,
      );
      const result = await plan(r, root);
      if (result.status === "planned") {
        packages = inventory(root, r).packages;
        console.log(
          `[deploy] affected=${result.plan.affected.join(", ")} targets=${result.plan.targets.join(", ")} order=${result.plan.deploys.join(", ")}`,
        );
      }
      return result;
    },
    sync: async () => {
      console.log("[deploy] Sync");
      const result = await command("pnpm", ["sync"], root);
      return result.status === "completed" && result.code === 0
        ? { status: "synced" }
        : {
            status: "sync-failed",
            reason: "Repository synchronization failed",
          };
    },
    checks: (p) => checks(root, select(p.affected)),
    configure: async (p, r) => {
      console.log("[deploy] Generate configuration");
      return configure(root, p, r, credentials);
    },
    build: (p) => build(root, select(p.builds)),
    deploy: (p) => deploy(root, select(p.deploys)),
    report: (state) => report(state, path),
  });
  console.log(
    `[deploy] Result: ${outcome.state.status}; report: ${outcome.report.status}`,
  );
  return outcome.exitCode;
}
