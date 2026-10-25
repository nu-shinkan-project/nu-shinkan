import { planConnections, connectionSignature } from "./connection-plan.js";
import { GlobalRuntimeEnvsYaml } from "@repo/app-config/global";
import { errorDetail } from "../diagnostics.js";
import {
  getWorkspaceConfigurations,
  workerMapping,
  readPackageConnections,
} from "../workspace/configs.js";
import type { Package } from "../workspace/types.js";
import { listDatabases, matchDatabase, type Cloudflare } from "./cloudflare.js";
import {
  assemblePackage,
  applyDatabaseIds,
  type PreparedPackage,
} from "./assemble.js";
import type { Configuration, Plan, Request } from "./types.js";

export async function configure(
  root: string,
  plan: Plan,
  request: Request,
  credentials: Cloudflare,
  packages: Package[],
): Promise<Configuration> {
  const prepared: PreparedPackage[] = [];
  try {
    const configs = getWorkspaceConfigurations(root, packages);
    const mapping = workerMapping(configs);
    const shared = new GlobalRuntimeEnvsYaml().variablesFor(request.profile);
    const targets = new Set(plan.targets);
    const actualConnections = [];
    const settings = new Map(
      configs.map((p) => [p.packageName, readPackageConnections(p)]),
    );
    for (const source of targets) {
      try {
        actualConnections.push(
          ...planConnections(settings, mapping, request, targets, {
            sources: new Set([source]),
          }),
        );
      } catch (error) {
        return {
          status: "configuration-failed",
          package: source,
          reason: errorDetail(error, [credentials.token]),
        };
      }
    }
    if (
      connectionSignature(actualConnections) !==
      connectionSignature(plan.connections)
    )
      return {
        status: "configuration-failed",
        reason: "Connection configuration changed after planning",
      };
    for (const source of configs.filter((p) => targets.has(p.packageName))) {
      try {
        prepared.push(
          assemblePackage(
            source,
            request,
            plan.connections.filter((c) => c.source === source.packageName),
            shared,
          ),
        );
      } catch (error) {
        return {
          status: "configuration-failed",
          package: source.packageName,
          reason: `Invalid deployment configuration: ${errorDetail(error, [credentials.token])}`,
        };
      }
    }
  } catch (error) {
    return {
      status: "configuration-failed",
      reason: `Cannot read deployment configuration: ${errorDetail(error, [credentials.token])}`,
    };
  }
  // Validate every selected package before querying any resources or saving.
  const required = prepared.flatMap((p) =>
    p.databases.map((name) => ({ package: p.source.packageName, name })),
  );
  const ids = new Map<string, string>();
  if (required.length) {
    const list = await listDatabases(credentials);
    for (const resource of required) {
      const failure = {
        status: "configuration-failed" as const,
        package: resource.package,
        resource: { kind: "D1", name: resource.name },
      };
      if (list.status === "list-failed")
        return { ...failure, reason: list.reason };
      if (ids.has(resource.name)) continue;
      const match = matchDatabase(resource.name, list.databases);
      if (match.status !== "matched")
        return {
          ...failure,
          reason: `D1 database ${match.status}: ${resource.name}`,
        };
      ids.set(resource.name, match.id);
    }
  }
  for (const item of prepared) {
    try {
      applyDatabaseIds(item, ids);
      item.dotenv?.save();
      item.wrangler?.save();
    } catch (error) {
      return {
        status: "configuration-failed",
        package: item.source.packageName,
        reason: `Cannot generate deployment configuration: ${errorDetail(error, [credentials.token])}`,
      };
    }
  }
  return { status: "generated" };
}
