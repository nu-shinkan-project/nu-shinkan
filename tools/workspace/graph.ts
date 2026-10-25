import { DeploymentYaml } from "@repo/app-config/deployment";
import { resolve } from "node:path";
import { ConnectionGraph } from "../connection-graph/graph.js";
import { listPackages } from "./packages.js";

export async function readConnectionGraph(root: string) {
  const packages = await listPackages(root);
  return ConnectionGraph.fromDeployments(
    packages.map((p) => p.name),
    new Map(
      packages.map((p) => [p.name, new DeploymentYaml(resolve(root, p.path))]),
    ),
  );
}
