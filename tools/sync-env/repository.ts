import { readPackageConnections } from "../workspace/connections/read.js";
import { WranglerJsonc } from "@repo/app-config/wrangler";
import { listPackages, selectFilteredPackages } from "../workspace/packages.js";
import {
  getWorkspaceConfigurations,
  workerMapping,
} from "../workspace/configs.js";
import { predictSynchronizedConnections } from "../workspace/connections/resolve.js";
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
  const packages = await listPackages(root);
  const selected = (
    await selectFilteredPackages(root, packages, filters)
  ).filter((p) => p.scripts["sync:local"]);
  const configs = getWorkspaceConfigurations(root, packages);
  const workers = workerMapping(configs);
  // Validate the full selected connection update before starting any synchronization.
  const updates = configs
    .filter((p) => selected.some((s) => s.name === p.packageName))
    .map((source) => {
      const settings = readPackageConnections(source);
      const predicted = predictSynchronizedConnections(settings, workers);
      const declared = new Set(Object.keys(settings.declarations.bindings));
      return {
        source,
        bindings: [
          ...new Map(
            [...predicted.bindings, ...Object.values(predicted.profiles).flat()]
              .filter((b) => declared.has(b.name))
              .map((b) => [b.name, b]),
          ).values(),
        ],
      };
    });
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
  // Variable synchronization ran in child processes. Reload before applying connection-only edits.
  for (const { source, bindings } of updates) {
    if (!bindings.length) continue;
    const wrangler = new WranglerJsonc(source.path);
    wrangler.synchronizeServices(bindings);
    if (!dryRun) wrangler.save();
  }
  // 一部だけの同期では、未同期のパッケージに必要な共有の削除指示を残す。
  if (filters.length > 0) {
    console.error(
      "[sync] Tasks succeeded; shared deletion directives retained for filtered synchronization.",
    );
    return;
  }

  // 登録された同期タスクがすべて成功した場合だけ、共有の削除指示を消費する。
  const global = new GlobalRuntimeEnvsYaml();
  if (!dryRun) {
    global.removeNull();
    global.save();
  }
  console.error(
    dryRun
      ? "[sync] Dry run succeeded; shared deletion directives retained."
      : "[sync] All tasks succeeded; shared deletion directives consumed.",
  );
}
