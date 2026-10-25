import type { Package } from "../workspace/types.js";
import { resolve } from "node:path";
import { command } from "../command.js";
import { commandFailure } from "../diagnostics.js";
import { runTurbo } from "../turbo/tasks.js";
import type { Builds, Deployment, Deployments } from "./types.js";

export async function build(
  root: string,
  packages: Package[],
): Promise<Builds> {
  const run = await runTurbo(
    root,
    packages.filter((p) => p.scripts.build).map((p) => p.name),
    "build",
    {
      only: false,
      concurrency: 1,
      continue: "always",
    },
  );
  return {
    status: run.status === "completed" ? "built" : "build-failed",
    results: run.results,
  };
}
export function aggregateDeployment(results: Deployment[]): Deployments {
  const failed = results.filter((r) => r.status === "deploy-failed").length;
  return {
    status: !failed
      ? "success"
      : failed === results.length
        ? "failure"
        : "partial-failure",
    results,
  };
}
export async function deploy(
  root: string,
  packages: Package[],
): Promise<Deployments> {
  const results: Deployment[] = [];
  for (const pkg of packages) {
    console.log(`[deploy] Deploying ${pkg.name}`);
    const run = await command(
      "pnpm",
      [
        "exec",
        "wrangler",
        "deploy",
        "--config",
        "wrangler.deploy.jsonc",
        "--minify",
      ],
      resolve(root, pkg.path),
      true,
    );
    if (run.status === "completed" && run.code === 0) {
      const url = run.stdout.match(
        /https:\/\/[a-zA-Z0-9.-]+\.workers\.dev\/?/,
      )?.[0];
      results.push({
        package: pkg.name,
        status: "deployed",
        ...(url ? { url } : {}),
      });
    } else
      results.push({
        package: pkg.name,
        status: "deploy-failed",
        reason: commandFailure(run, "Wrangler"),
      });
    console.log(`[deploy] ${pkg.name}: ${results.at(-1)!.status}`);
  }
  return aggregateDeployment(results);
}
