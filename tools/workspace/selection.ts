import type { WorkspaceConfiguration } from "./configs.js";
import { selectPackages } from "./packages.js";

export function selectWorkspaceConfigurations(
  configurations: WorkspaceConfiguration[],
  names?: string[],
) {
  return selectPackages(
    configurations.map((pkg) => ({ name: pkg.packageName, config: pkg })),
    names,
  ).map(({ config }) => ({
    packageName: config.packageName,
    path: config.path,
    pathRel: config.pathRel,
    ...(config.dotenv !== undefined ? { dotenv: config.dotenv } : {}),
    wrangler: config.wrangler?.data,
  }));
}
