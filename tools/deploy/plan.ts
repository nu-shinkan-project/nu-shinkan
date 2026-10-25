import { planConnections } from "./connection-plan.js";
import type { PackageConnections, Workers } from "../workspace/connections.js";
import type { Package } from "../workspace/types.js";
import { type Deployment } from "@repo/app-config/deployment";
import { ConnectionGraph } from "../connection-graph/graph.js";
import {
  getWorkspaceConfigurations,
  workerMapping,
  readPackageConnections,
} from "../workspace/configs.js";
import { commandFailure, errorDetail } from "../diagnostics.js";
import {
  listPackages,
  selectWithDependents,
  selectPackages,
} from "../workspace/packages.js";
import { command } from "../command.js";
import type { Request, Planning, Source } from "./types.js";

export type Inventory = {
  packages: Package[];
  workspace: Package[];
  deployments: ReadonlyMap<string, Deployment>;
  connections: ReadonlyMap<string, PackageConnections>;
  workers: Workers;
};
export async function inventory(root: string): Promise<Inventory> {
  const allPackages = await listPackages(root);
  const configs = getWorkspaceConfigurations(root, allPackages);
  const packages = allPackages.filter((p) => /^(apps|packages)\//.test(p.path));
  const deployments = new Map(
    configs.map((p) => [p.packageName, p.deployment]),
  );
  return {
    packages,
    workspace: allPackages,
    deployments,
    connections: new Map(
      configs.map((p) => [p.packageName, readPackageConnections(p)]),
    ),
    workers: workerMapping(configs),
  };
}

/** Collapse cycles so constraints outside each cycle remain enforceable. */
export function deploymentOrder(
  names: string[],
  edges: [string, string][],
): { order: string[]; warnings: string[] } {
  const selected = new Set(names);
  const dependencies = new Map(names.map((name) => [name, new Set<string>()]));
  for (const [source, destination] of edges)
    if (
      source !== destination &&
      selected.has(source) &&
      selected.has(destination)
    )
      dependencies.get(source)!.add(destination);
  const components = stronglyConnectedComponents(dependencies);
  const order = orderComponents(dependencies, components);
  const warnings = components
    .filter((group) => group.length > 1)
    .map((group) => `Service Binding cycle: ${group.join(", ")}`);
  return { order, warnings };
}

function stronglyConnectedComponents(
  dependencies: Map<string, Set<string>>,
): string[][] {
  const callers = new Map(
    [...dependencies.keys()].map((name) => [name, new Set<string>()]),
  );
  for (const [source, destinations] of dependencies)
    for (const destination of destinations)
      callers.get(destination)!.add(source);
  const visited = new Set<string>();
  const finished: string[] = [];
  for (const start of dependencies.keys()) {
    const pending: [string, boolean][] = [[start, false]];
    while (pending.length) {
      const [name, expanded] = pending.pop()!;
      if (expanded) {
        finished.push(name);
        continue;
      }
      if (visited.has(name)) continue;
      visited.add(name);
      pending.push([name, true]);
      for (const destination of [...dependencies.get(name)!].reverse())
        pending.push([destination, false]);
    }
  }
  const assigned = new Set<string>();
  const components: string[][] = [];
  for (const start of finished.reverse()) {
    if (assigned.has(start)) continue;
    const component: string[] = [];
    const pending = [start];
    while (pending.length) {
      const name = pending.pop()!;
      if (assigned.has(name)) continue;
      assigned.add(name);
      component.push(name);
      pending.push(...callers.get(name)!);
    }
    components.push(component.sort());
  }
  return components;
}

function orderComponents(
  dependencies: Map<string, Set<string>>,
  components: string[][],
): string[] {
  const membership = new Map(
    components.flatMap((group, index) =>
      group.map((name) => [name, index] as const),
    ),
  );
  const emitted = new Set<number>();
  const order: string[] = [];
  for (const start of components.keys()) {
    const pending: [number, boolean][] = [[start, false]];
    while (pending.length) {
      const [index, expanded] = pending.pop()!;
      if (expanded) {
        order.push(...components[index]!);
        continue;
      }
      if (emitted.has(index)) continue;
      emitted.add(index);
      pending.push([index, true]);
      const destinations = components[index]!.flatMap((name) =>
        [...dependencies.get(name)!].map((destination) =>
          membership.get(destination)!,
        ),
      ).filter((destination) => destination !== index);
      for (const destination of destinations.reverse())
        pending.push([destination, false]);
    }
  }
  return order;
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
  let connections;
  try {
    connections = planConnections(
      data.connections,
      data.workers,
      request,
      new Set(targets),
      { predictSync: true },
    );
  } catch (error) {
    return {
      status: "unavailable",
      reason: `Cannot resolve connections: ${errorDetail(error)}`,
      unknownPackages: [],
    };
  }
  const { order, warnings } = deploymentOrder(
    apps.map((p) => p.name),
    connections
      .filter(
        (c) =>
          c.kind === "binding" &&
          c.package !== undefined &&
          (c.channel !== "preview" || targets.includes(c.package)),
      )
      .map((c) => [c.source, c.package!] as [string, string]),
  );
  const executionPackages = new Map(data.workspace.map((p) => [p.name, p]));
  if (executionPackages.size !== data.workspace.length)
    throw new Error("Duplicate execution package name");
  selectPackages(data.workspace, [
    ...selection.origins,
    ...affected,
    ...targets,
    ...order,
  ]);
  return {
    status: "planned",
    context: { packages: executionPackages },
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
      connections,
    },
  };
}
export async function plan(request: Request, root: string): Promise<Planning> {
  let data: Inventory;
  try {
    data = await inventory(root);
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
