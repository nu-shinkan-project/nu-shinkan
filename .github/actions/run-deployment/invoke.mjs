import { spawnSync } from "node:child_process";

try {
  const entry = process.env.DEPLOY_ENTRY;
  if (!["update", "full", "review", "manual-pick", "cleanup"].includes(entry))
    throw new Error("Invalid deployment entry");
  const args = [
    "exec",
    "tsx",
    `tools/deploy/${entry}.ts`,
    "--report",
    ".artifacts/deploy-report.md",
  ];
  if (entry !== "cleanup")
    args.push(
      "--channel",
      process.env.DEPLOY_CHANNEL ?? "",
      "--commit",
      process.env.DEPLOY_COMMIT ?? "",
    );
  if (process.env.DEPLOY_BASE) args.push("--base", process.env.DEPLOY_BASE);
  if (process.env.DEPLOY_PR) args.push("--pr", process.env.DEPLOY_PR);
  if (entry === "manual-pick") {
    const picked = JSON.parse(process.env.DEPLOY_PICKED ?? "[]");
    if (
      !Array.isArray(picked) ||
      picked.some((name) => typeof name !== "string")
    )
      throw new Error("Invalid package list");
    for (const name of picked) args.push("--package", name);
  }
  console.log(
    `[workflow] Invoking ${entry} for ${process.env.DEPLOY_CHANNEL}; fixed commit=${process.env.DEPLOY_COMMIT}`,
  );
  const result = spawnSync("pnpm", args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  console.log(`[workflow] CLI completed: ${result.status ?? "terminated"}`);
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
