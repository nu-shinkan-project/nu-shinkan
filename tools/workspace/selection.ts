import type { WorkspaceConfiguration } from "./configs.js";
import { selectPackages } from "./packages.js";

export function selectWorkspaceConfigurations(
  configurations: WorkspaceConfiguration[],
  names?: string[],
) {
  return selectPackages(
    configurations.map((pkg) => ({ name: pkg.packageName, config: pkg })),
    names,
  ).map(({ config }) => ({ ...config, wrangler: config.wrangler?.data }));
}
