import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { checks, checkTasks, type CheckTask } from "./checks.js";
import { listPackages } from "./packages.js";

export async function runChecks(
  root: string,
  names?: string[],
  tasks?: string[],
): Promise<number> {
  rmSync(resolve(root, ".artifacts/checking-result.json"), { force: true });
  if (tasks?.some((task) => !checkTasks.includes(task as CheckTask)))
    throw new Error(`Supported tasks: ${checkTasks.join(", ")}`);
  const packages = await listPackages(root, names);
  console.log(
    `[checking] Selected ${packages.length} workspaces${packages.length ? "" : ": empty selection"}`,
  );
  const result = await checks(
    root,
    packages,
    tasks ? ([...new Set(tasks)] as CheckTask[]) : undefined,
  );
  const directory = resolve(root, ".artifacts");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, "checking-result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    `[checking] Result: ${result.status}; details: .artifacts/checking-result.json`,
  );
  return result.status === "passed" ? 0 : 1;
}
