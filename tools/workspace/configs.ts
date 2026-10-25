import { resolve } from "node:path";
import { WranglerJsonc } from "@repo/app-config/wrangler";
import { Dotenv } from "@repo/app-config/dotenv";
import type { Package } from "./types.js";

export type WorkspaceConfiguration = {
  packageName: string;
  path: string;
  pathRel: string;
  wrangler?: WranglerJsonc;
  dotenv?: Record<string, string>;
};

/** Load settings at the caller's chosen phase from a captured Turbo inventory. */
export function getWorkspaceConfigurations(
  root: string,
  packages: Package[],
): WorkspaceConfiguration[] {
  return packages.map((pkg) => {
    const path = resolve(root, pkg.path);
    const wrangler = new WranglerJsonc(path);
    const dotenv = new Dotenv(path);
    return {
      packageName: pkg.name,
      path,
      pathRel: pkg.path,
      ...(wrangler.exists() ? { wrangler } : {}),
      ...(dotenv.exists() ? { dotenv: dotenv.variables } : {}),
    };
  });
}

/** Validate only when Worker identity is needed, never for plain inventory. */
export function workerMapping(configs: WorkspaceConfiguration[]) {
  const byPackage = new Map<string, string>();
  const byWorker = new Map<string, string>();
  for (const pkg of configs) {
    if (!pkg.wrangler) continue;
    const name = pkg.wrangler.name;
    if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(name))
      throw new Error(`Invalid Worker name: ${pkg.packageName}`);
    if (byWorker.has(name)) throw new Error(`Duplicate Worker name: ${name}`);
    byPackage.set(pkg.packageName, name);
    byWorker.set(name, pkg.packageName);
  }
  return { byPackage, byWorker };
}
