import { generate } from "@repo/app-config/materialize";
import { getWorkspaceConfigurations } from "../workspace/configs.js";
import { listDatabases, matchDatabase, type Cloudflare } from "./cloudflare.js";
import type { Configuration, Plan, Request } from "./types.js";
import type { Database } from "@repo/app-config/materialize";

export async function configure(
  root: string,
  plan: Plan,
  request: Request,
  credentials: Cloudflare,
): Promise<Configuration> {
  const configs = getWorkspaceConfigurations(root);
  const targets = new Map(
    configs
      .filter((p) => plan.targets.includes(p.packageName))
      .map((p) => [
        p.packageName,
        { path: p.pathRel, workerName: p.wrangler?.name },
      ]),
  );
  const workers = new Map(
    configs
      .filter((p) => p.wrangler)
      .map((p) => [p.packageName, p.wrangler!.name]),
  );
  const context = {
    channel: request.channel,
    profile: request.profile,
    prNumber: request.prNumber,
    targets,
    workers,
  };
  const required: { package: string; name: string }[] = [];
  for (const p of configs.filter((p) => targets.has(p.packageName))) {
    if (!p.wrangler) continue;
    const config = p.wrangler.data;
    const databases =
      config.env?.[request.profile]?.d1_databases ?? config.d1_databases ?? [];
    if (!Array.isArray(databases))
      return {
        status: "configuration-failed",
        package: p.packageName,
        reason: "Invalid D1 configuration",
      };
    for (const database of databases as Database[]) {
      if (
        !database ||
        typeof database.database_name !== "string" ||
        !database.database_name
      )
        return {
          status: "configuration-failed",
          package: p.packageName,
          reason: "D1 database_name is required",
        };
      required.push({
        package: p.packageName,
        name: `${database.database_name}-${request.profile}`,
      });
    }
  }
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
  for (const p of configs.filter((p) => targets.has(p.packageName))) {
    try {
      generate(p.path, context, ids);
    } catch {
      return {
        status: "configuration-failed",
        package: p.packageName,
        reason:
          "Cannot generate deployment configuration; check native configuration and connections",
      };
    }
  }
  return { status: "generated" };
}
