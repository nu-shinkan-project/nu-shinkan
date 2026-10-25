import { GlobalRuntimeEnvsYaml } from "@repo/app-config/global";
import { command } from "../command.js";
import { commandFailure } from "../diagnostics.js";

export async function syncRepository(
  root: string,
  {
    dryRun = false,
    filters = [],
  }: { dryRun?: boolean; filters?: string[] } = {},
): Promise<void> {
  // sync:localを登録したパッケージだけをTurboで同期する。
  const run = await command(
    "pnpm",
    [
      "exec",
      "turbo",
      "run",
      "sync:local",
      ...filters.map((filter) => `--filter=${filter}`),
      ...(dryRun ? ["--", "--dry-run"] : []),
    ],
    root,
  );
  if (run.status !== "completed" || run.code !== 0)
    throw new Error(commandFailure(run, "Repository synchronization failed"));
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
