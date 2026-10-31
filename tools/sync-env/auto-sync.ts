import fs from "fs";
import { spawnSync } from "child_process";

/**
 * issue sync command
 */

function sync() {
  spawnSync("pnpm", ["tsx", "tools/sync-env/auto-sync.ts"]);
}

class Throttler {
  planned_issue: NodeJS.Timeout = setTimeout(() => {}, 0);
  task: () => void;
  last_sync = 0;
  INTERVAL = 3000;

  constructor(task: () => void) {
    this.task = task;
  }

  issue() {
    const now = Date.now();
    if (now - this.last_sync < this.INTERVAL) {
      clearTimeout(this.planned_issue);
      this.planned_issue = setTimeout(() => this.issue(), this.INTERVAL);
      return;
    }
    this.last_sync = now;
    this.task();
  }
}

const sync_throttled = new Throttler(sync);

/**
 * watch global env file
 */
fs.watch("packages/app-config/globalRuntimeEnvs.yaml", () =>
  sync_throttled.issue(),
);

/**
 * watch apps
 */
class WatcherCollection {
  watchers: fs.FSWatcher[] = [];
  handler: () => void;
  constructor(handler: () => void) {
    this.handler = handler;
  }

  clear() {
    this.watchers.forEach((w) => w.close());
    this.watchers = [];
  }
  add(file: string) {
    let watcher: fs.FSWatcher;
    try {
      watcher = fs.watch(file, this.handler);
    } catch (err) {
      // nothing to do when file missing
      const has_code = err instanceof Object && "code" in err;
      if (has_code && err.code === "ENOENT") return;
      // otherwise, escalate the error
      throw err;
    }
    this.watchers.push(watcher);
  }
}

function watch_app_packages(target_files: string[], task: () => void) {
  // prepare watcher collection that execute task on change in apps/*/{target_files}
  const watchers = new WatcherCollection(task);
  function renew_watchers() {
    watchers.clear();
    fs.readdirSync("apps/").forEach((app) => {
      target_files.forEach((f) => watchers.add(`apps/${app}/${f}`));
    });
  }

  // initialize watcher collection at first.
  // this is necessary to watch already-existing files
  renew_watchers();
  // watch for creattion/deletion of apps themselves.
  fs.watch("apps/", renew_watchers);
}

watch_app_packages(["deployment.yaml", "package.json", "wrangler.jsonc"], () =>
  sync_throttled.issue(),
);
