import { readServiceConnections } from "@repo/app-config/wrangler";
import type { WorkspaceConfiguration } from "../configs.js";
import type { PackageConnections } from "./resolve.js";
import { DeploymentYaml } from "@repo/app-config/deployment";
import { resolve } from "node:path";
import { ConnectionGraph } from "./graph.js";
import { listPackages } from "../packages.js";

export async function readConnectionGraph(root: string) {
  const packages = await listPackages(root);
  return ConnectionGraph.fromDeployments(
    packages.map((p) => p.name),
    new Map(
      packages.map((p) => [p.name, new DeploymentYaml(resolve(root, p.path))]),
    ),
  );
}

export function readPackageConnections(
  source: WorkspaceConfiguration,
): PackageConnections {
  const config = source.wrangler?.data;
  const profiles: PackageConnections["profiles"] = {};
  for (const profile of ["staging", "release"] as const) {
    if (config?.env?.[profile]?.services !== undefined)
      profiles[profile] = readServiceConnections(config, profile);
  }
  return {
    bindings: config ? readServiceConnections(config) : [],
    profiles,
    declarations: source.deployment.connections,
  };
}
