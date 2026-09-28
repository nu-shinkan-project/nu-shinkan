import { GlobalRuntimeEnvsYaml } from "@repo/app-config/global";
import { execFileSync } from "node:child_process";
import { findWorkspaceRoot } from "../workspace/root.js";
import { parseArgs } from "node:util";

// Main Logic

function main() {
  const { values } = parseArgs({
    options: {
      root: { type: "string" },
      filter: { type: "string", multiple: true },
      "dry-run": { type: "boolean" },
      check: { type: "boolean" },
    },
  });
  sync(values.root, values["dry-run"] || values.check, values.filter);
}

function sync(
  root = findWorkspaceRoot(),
  dryRun = false,
  filters: string[] = [],
): void {
  // sync:localを登録したパッケージだけをTurboで同期する。
  execFileSync(
    "pnpm",
    [
      "exec",
      "turbo",
      "run",
      "sync:local",
      ...filters.map((filter) => `--filter=${filter}`),
      ...(dryRun ? ["--", "--dry-run"] : []),
    ],
    { cwd: root, stdio: "inherit" },
  );
  // 一部だけの同期では、未同期のパッケージに必要な共有の削除指示を残す。
  if (filters.length > 0) {
    console.error(
      "[sync] Tasks succeeded; shared deletion directives retained for filtered synchronization.",
    );
    return;
  }

  // 登録された同期タスクがすべて成功した場合だけ、共有の削除指示を消費する。
  const global = new GlobalRuntimeEnvsYaml();
  global.removeNull();
  if (!dryRun) global.save();
  console.error(
    dryRun
      ? "[sync] Dry run succeeded; shared deletion directives retained."
      : "[sync] All tasks succeeded; shared deletion directives consumed.",
  );
}

// EntryPoint
try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
