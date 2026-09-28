import { spawnSync } from "node:child_process";
import type { AppKind } from "./cli.js";

type PostplaceInput = {
  appKind: AppKind;
  targetDir: string;
};

/** Main Logic */
export function runPostplace(input: PostplaceInput): void {
  runCommandOrThrow("pnpm install", "pnpm", ["install"], input.targetDir);

  if (input.appKind === "backend") {
    runCommandOrThrow(
      "pnpm cf-typegen",
      "pnpm",
      ["cf-typegen"],
      input.targetDir,
    );
  }
}

/** Helper */
function runCommandOrThrow(
  name: string,
  command: string,
  args: string[],
  cwd: string,
): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`${name} に失敗しました (exit=${result.status})`);
  }
}
