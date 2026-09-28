import type { WorkspaceConfiguration } from "./configs.js";

export function selectWorkspaceConfigurations(
  configurations: WorkspaceConfiguration[],
  names: string[],
  { targets = false }: { targets?: boolean } = {},
) {
  const unknown = names.filter(
    (name) => !configurations.some((pkg) => pkg.packageName === name),
  );
  if (unknown.length)
    throw new Error(`Unknown packages: ${unknown.join(", ")}`);
  // targets receives exact names; no names means no deployment targets.
  const selected =
    targets || names.length
      ? configurations.filter((pkg) => names.includes(pkg.packageName))
      : configurations;
  return selected.map((pkg) => {
    if (!targets) return { ...pkg, wrangler: pkg.wrangler?.data };
    const workerName = pkg.wrangler?.name;
    if (
      pkg.wrangler &&
      (typeof workerName !== "string" ||
        !/^[a-z0-9][a-z0-9-]*$/.test(workerName))
    )
      throw new Error(`Invalid Worker name: ${pkg.packageName}`);
    return {
      package: pkg.packageName,
      path: pkg.pathRel,
      ...(workerName ? { workerName } : {}),
    };
  });
}
