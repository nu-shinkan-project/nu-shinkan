import { runTurbo } from "../turbo/tasks.js";
import type { Check } from "./types.js";
import type { Package } from "../workspace/types.js";

/** Check policy: run only affected scripts, sequentially, continuing after failure. */
export async function turboTask(
  root: string,
  packages: Package[],
  task: string,
): Promise<Check[]> {
  const registered = packages.filter((p) => p.scripts[task]);
  console.log(
    `[checking] ${task}: ${registered.length ? registered.map((p) => p.name).join(", ") : "no registered tasks"}`,
  );
  const run = await runTurbo(
    root,
    registered.map((p) => p.name),
    task,
    {
      only: true,
      concurrency: 1,
      continue: "always",
      args: task === "test" ? ["--run"] : [],
      env: { ...process.env, TEST: "PACKAGE" },
    },
  );
  const results: Check[] = packages.map((pkg) => {
    if (!pkg.scripts[task])
      return { package: pkg.name, task, status: "no-script", cached: false };
    return run.results.find((r) => r.package === pkg.name)!;
  });
  // Preserve a failed Turbo invocation even when every requested task reports success.
  if (
    run.status === "failed" &&
    !results.some(
      (r) => r.status === "failed" || r.status === "execution-error",
    )
  ) {
    const first = results.find((r) => r.status === "passed");
    if (first) {
      first.status = "execution-error";
      first.reason = run.reason ?? "Turbo or a dependency failed";
    }
  }
  for (const r of results)
    console.log(
      `[checking] ${r.package} ${task}: ${r.status}${r.cached ? " (cache)" : ""}${r.reason ? `; ${r.reason}` : ""}`,
    );
  return results;
}
