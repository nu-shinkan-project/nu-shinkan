import type { Package } from "../workspace/types.js";
import { DeploymentYaml, type Deployment } from "@repo/app-config/deployment";
import { ConnectionGraph } from "../connection-graph/graph.js";
import {
  getWorkspaceConfigurations,
  workerMapping,
} from "../workspace/configs.js";
import { commandFailure, errorDetail } from "../diagnostics.js";
import { listPackages, selectWithDependents } from "../workspace/packages.js";
import { command } from "../command.js";
import type { Request, Planning, Source } from "./types.js";

export type Inventory = {
  packages: Package[];
  deployments: ReadonlyMap<string, Deployment>;
  bindings: [string, string][];
};
export async function inventory(
  root: string,
  request: Request,
): Promise<Inventory> {
  const packages = (await listPackages(root)).filter((p) =>
    /^(apps|packages)\//.test(p.path),
  );
  const configs = getWorkspaceConfigurations(root, packages);
  const deployments = new Map(
    configs.map((p) => [p.packageName, readDeployment(p.path)]),
  );
  const workerPackages = workerMapping(configs).byWorker;
  const bindings: [string, string][] = [];
  for (const p of configs) {
    const config = p.wrangler?.data;
    const services =
      config?.env?.[request.profile]?.services ?? config?.services ?? [];
    const configured = deployments.get(p.packageName)!.connections.bindings;
    for (const service of services) {
      const target =
        configured[service.binding] ?? workerPackages.get(service.service);
      if (target && target !== p.packageName)
        bindings.push([p.packageName, target]);
    }
  }
  return { packages, deployments, bindings };
}

/** Strongly connected components preserve constraints outside each cycle. */
export function deploymentOrder(
  names: string[],
  edges: [string, string][],
): { order: string[]; warnings: string[] } {
  const selected = new Set(names);
  const graph = new Map(
    names.map((n) => [
      n,
      edges
        .filter(([a, b]) => a === n && selected.has(b) && a !== b)
        .map(([, b]) => b),
    ]),
  );
  const visited = new Set<string>(),
    finished: string[] = [];
  function visit(n: string) {
    if (visited.has(n)) return;
    visited.add(n);
    for (const to of graph.get(n)!) visit(to);
    finished.push(n);
  }
  names.forEach(visit);
  const assigned = new Set<string>(),
    components: string[][] = [];
  function reverse(n: string, group: string[]) {
    if (assigned.has(n)) return;
    assigned.add(n);
    group.push(n);
    for (const [from, tos] of graph) if (tos.includes(n)) reverse(from, group);
  }
  for (const n of [...finished].reverse())
    if (!assigned.has(n)) {
      const group: string[] = [];
      reverse(n, group);
      components.push(group.sort());
    }
  const membership = new Map(
    components.flatMap((group, i) => group.map((n) => [n, i] as const)),
  );
  const ordered = new Set<number>(),
    order: string[] = [];
  function emit(i: number) {
    if (ordered.has(i)) return;
    ordered.add(i);
    for (const n of components[i]!)
      for (const to of graph.get(n)!)
        if (membership.get(to) !== i) emit(membership.get(to)!);
    order.push(...components[i]!);
  }
  components.forEach((_, i) => emit(i));
  return {
    order,
    warnings: components
      .filter((g) => g.length > 1)
      .map((g) => `Service Binding cycle: ${g.join(", ")}`),
  };
}

export function collectOrigins(
  request: Request,
  packages: Package[],
  diff: { files: string[]; available: boolean },
): { source: Source; origins: string[]; fallback?: string; unknown: string[] } {
  const names = packages.map((p) => p.name);
  if (request.source === "manual-pick")
    return {
      source: request.source,
      origins: [...new Set(request.packages)],
      unknown: request.packages.filter((n) => !names.includes(n)),
    };
  const shared = ["pnpm-lock.yaml", "turbo.json", "pnpm-workspace.yaml"];
  const fallback =
    request.source === "diff"
      ? !diff.available
        ? "Comparison history unavailable"
        : shared.some((f) => diff.files.includes(f))
          ? "Shared workspace configuration changed"
          : undefined
      : undefined;
  const source = fallback ? "full" : request.source;
  return {
    source,
    origins:
      source === "full"
        ? names
        : packages
            .filter((p) => diff.files.some((f) => f.startsWith(`${p.path}/`)))
            .map((p) => p.name),
    fallback,
    unknown: [],
  };
}
export function finalizePlan(
  request: Request,
  data: Inventory,
  selection: ReturnType<typeof collectOrigins>,
  affected: string[],
): Planning {
  if (selection.unknown.length)
    return {
      status: "invalid",
      reason: "Unknown packages",
      unknownPackages: selection.unknown,
    };
  const targets =
    request.purpose === "review"
      ? ConnectionGraph.fromDeployments(
          data.packages.map((p) => p.name),
          data.deployments,
        ).selectReviewTargets(affected)
      : affected;
  const apps = data.packages.filter(
    (p) => targets.includes(p.name) && p.path.startsWith("apps/"),
  );
  const { order, warnings } = deploymentOrder(
    apps.map((p) => p.name),
    data.bindings,
  );
  return {
    status: "planned",
    context: { packages: new Map(data.packages.map((p) => [p.name, p])) },
    plan: {
      initialSource: request.source,
      source: selection.source,
      fallback: selection.fallback,
      origins: selection.origins,
      affected,
      targets,
      builds: apps.filter((p) => p.scripts.build).map((p) => p.name),
      deploys: order,
      warnings,
    },
  };
}
export async function plan(request: Request, root: string): Promise<Planning> {
  let data: Inventory;
  try {
    data = await inventory(root, request);
  } catch (error) {
    return {
      status: "unavailable",
      reason: `Cannot read workspace configuration: ${errorDetail(error)}`,
      unknownPackages: [],
    };
  }
  let files: string[] = [],
    available = request.source !== "diff";
  let comparisonFailure: string | undefined;
  if (request.source === "diff" && request.base) {
    const comparison =
      request.purpose === "review"
        ? `${request.base}...${request.commit}`
        : request.base;
    const args =
      request.purpose === "review"
        ? [comparison]
        : [comparison, request.commit];
    const diff = await command(
      "git",
      ["diff", "--no-renames", "--name-only", "-z", ...args, "--"],
      root,
      true,
    );
    available = diff.status === "completed" && diff.code === 0;
    if (available) files = diff.stdout.split("\0").filter(Boolean);
    else comparisonFailure = commandFailure(diff, "Git comparison failed");
  }
  const selection = collectOrigins(request, data.packages, {
    files,
    available,
  });
  if (comparisonFailure) selection.fallback += `: ${comparisonFailure}`;
  if (selection.unknown.length)
    return {
      status: "invalid",
      reason: "Unknown packages",
      unknownPackages: selection.unknown,
    };
  let affected = selection.origins;
  if (selection.source !== "full" && affected.length) {
    try {
      const expanded = new Set(
        (await selectWithDependents(root, data.packages, affected, true)).map(
          (p) => p.name,
        ),
      );
      affected = data.packages
        .filter((p) => expanded.has(p.name))
        .map((p) => p.name);
    } catch (error) {
      return {
        status: "unavailable",
        reason: `Invalid Turbo dependency selection: ${errorDetail(error)}`,
        unknownPackages: [],
      };
    }
  }
  return finalizePlan(request, data, selection, affected);
}

function readDeployment(path: string): Deployment {
  const config = new DeploymentYaml(path);
  return {
    envs: config.envs,
    connections: config.connections,
    reviewEntry: config.reviewEntry,
  };
}
