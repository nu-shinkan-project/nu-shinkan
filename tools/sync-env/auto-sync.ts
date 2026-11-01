import fs from "fs";
import crypto from "crypto";
import { findWorkspaceRoot } from "../workspace/root.js";
import { resolve } from "node:path";
import { listPackages } from "../workspace/packages.js";
import { syncRepository } from "./repository.js";

/**
 * Helpers
 */

const reporoot = findWorkspaceRoot();

async function sync() {
  console.debug(new Date(), "[sync]");
  try {
    await syncRepository(reporoot);
  } catch (err) {
    // prevent crash of watcher process on error
    console.error(new Date(), "[sync] failed:", err);
  }
}

/**
 * Helpers: Controlling the timing to run task
 */

/// serialize (mutex) asyncronous tasks
class IssueSerializer {
  task: () => Promise<void>;
  redo = false;
  processing = false;
  constructor(task: () => Promise<void>) {
    this.task = task;
  }

  issue() {
    // mark processing or redo
    console.debug(new Date(), "[serializer] the task issued");
    if (this.processing) {
      console.debug(new Date(), "[serializer] already processing");
      this.redo = true;
      return;
    }
    this.processing = true;

    this.task().then(() => {
      // on task finish, clear processing flag
      console.debug(new Date(), "[serializer] done");
      this.processing = false;
      if (this.redo) {
        // redo if needed but only once
        this.redo = false;
        console.debug(new Date(), "[serializer] redo");
        this.issue();
      }
    });
  }
}

class ConfigChangeDetector {
  task: () => void;
  last_hash = "";

  constructor(task: () => void) {
    this.task = task;
  }

  async issue_if_changed() {
    // Hash file contents without depending on the configuration models.
    const configuration_hash = crypto.createHash("md5");

    // take in the global configuration file
    const global_env_path = resolve(
      reporoot,
      "packages/app-config/globalRuntimeEnvs.yaml",
    );
    configuration_hash.update(
      JSON.stringify([
        global_env_path,
        fs.readFileSync(global_env_path, "utf8"),
      ]),
    );

    // take in each package's config files
    const packages = await listPackages(reporoot);
    const per_package_config_files = [
      "wrangler.jsonc",
      "deployment.yaml",
      "package.json",
    ];
    const paths = packages
      .flatMap((pkg) =>
        per_package_config_files.map((file) =>
          resolve(reporoot, pkg.path, file),
        ),
      )
      .sort();
    for (const path of paths) {
      const content = fs.existsSync(path)
        ? fs.readFileSync(path, "utf8")
        : null;
      // Include the path and distinguish a missing file from an empty one.
      configuration_hash.update(JSON.stringify([path, content]));
    }

    // done hashing all config files
    const hash = configuration_hash.digest("hex");
    console.debug(new Date(), "[change-detector] hash:", hash);

    // check if changed
    if (hash !== this.last_hash) {
      console.debug(new Date(), "[change-detector] config changed");
      this.last_hash = hash;
      this.task();
    } else {
      console.debug(new Date(), "[change-detector] config not changed");
    }
  }
}

class Throttler {
  task: () => void;
  planned_issue: NodeJS.Timeout = setTimeout(() => {}, 0);
  last_sync = 0;
  INTERVAL = 500;

  constructor(task: () => void) {
    this.task = task;
  }

  issue() {
    console.debug(new Date(), "[throttler] the task issued");
    const now = Date.now();
    if (now - this.last_sync < this.INTERVAL) {
      clearTimeout(this.planned_issue);
      this.planned_issue = setTimeout(() => this.issue(), this.INTERVAL);
      console.debug(new Date(), "[throttler] throttled");
      return;
    }
    this.last_sync = now;
    this.task();
  }
}

/**
 * Helpers: Observing events
 */

function try_watch(path: string, handler: () => void) {
  console.debug(new Date(), "[watch] try to watch", path);
  try {
    return fs.watch(path, handler);
  } catch (err) {
    // suppress errors to prevent crush of watcher process
    console.error(new Date(), "[watch] failed to watch", path, err);
  }
}

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
    const watcher = try_watch(file, this.handler);
    if (!watcher) return;
    this.watchers.push(watcher);
  }
}

function watch_app_packages(task: () => void) {
  // prepare watcher collection that execute task on change in apps/*/{target_files}
  const watchers = new WatcherCollection(task);
  function renew_watchers() {
    watchers.clear();
    fs.readdirSync(resolve(reporoot, "apps")).forEach((app) => {
      watchers.add(resolve(reporoot, `apps/${app}`));
    });
    task();
  }

  // initialize watcher collection at first.
  // this is necessary to watch already-existing files
  renew_watchers();
  // watch for creattion/deletion of apps themselves.
  try_watch(resolve(reporoot, "apps"), renew_watchers);
}
/**
 * Orchestrate: main program
 */

const serialized_sync = new IssueSerializer(() => sync());
const sync_only_on_change = new ConfigChangeDetector(() =>
  serialized_sync.issue(),
);
const sync_throttled = new Throttler(() =>
  sync_only_on_change.issue_if_changed(),
);

sync_throttled.issue();
try_watch(resolve(reporoot, "packages/app-config"), () =>
  sync_throttled.issue(),
);
watch_app_packages(() => sync_throttled.issue());
