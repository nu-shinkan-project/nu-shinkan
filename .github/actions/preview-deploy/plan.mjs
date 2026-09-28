import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export function planPreview(sources, picked = []) {
  const run = (file, args = [], input) =>
    execFileSync("pnpm", ["exec", "tsx", file, ...args], {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "inherit"],
    });
  const graph = run("tools/connection-graph/build.ts");
  const extent = JSON.parse(
    run(
      "tools/connection-graph/select.ts",
      ["--graph", "-", "--", ...sources],
      graph,
    ),
  );
  // Explicit picks remain candidates even without a reviewEntry path.
  // Packages without a deploy task are removed by filter-util at execution time.
  const packages = [...new Set([...picked, ...extent])];
  const targets = JSON.parse(
    run("tools/workspace/configs-cli.ts", ["--targets", ...packages]),
  );
  return { packages, targets };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const plan = planPreview(
    JSON.parse(process.env.PACKAGES),
    JSON.parse(process.env.PICKED || "[]"),
  );
  console.error(`[preview-plan] selected=${plan.packages.length} targets=${plan.targets.length}`);
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `packages=${JSON.stringify(plan.packages)}\ntargets=${JSON.stringify(plan.targets)}\n`,
  );
}
