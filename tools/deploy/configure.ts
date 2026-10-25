import { listPackages } from "../workspace/packages.js";
import { errorDetail } from "../diagnostics.js";
import { DeploymentSettings } from "@repo/app-config/settings";
import { Dotenv } from "@repo/app-config/dotenv";
import type { WranglerJson } from "@repo/app-config/wrangler";
import {
  getWorkspaceConfigurations,
  type WorkspaceConfiguration,
} from "../workspace/configs.js";
import { listDatabases, matchDatabase, type Cloudflare } from "./cloudflare.js";
import { buildWorkerName } from "./worker-name.js";
import { resolveVariables, resolveServiceBindings } from "./connections.js";
import type { Configuration, Plan, Request } from "./types.js";

export async function configure(
  root: string,
  plan: Plan,
  request: Request,
  credentials: Cloudflare,
): Promise<Configuration> {
  const configs = getWorkspaceConfigurations(root, await listPackages(root));
  const targets = new Set(plan.targets);
  const workers = new Map(
    configs
      .filter((p) => p.wrangler)
      .map((p) => [p.packageName, p.wrangler!.name]),
  );
  const prepared: {
    source: WorkspaceConfiguration;
    wrangler?: WranglerJson;
  }[] = [];
  const required: { package: string; name: string }[] = [];
  for (const source of configs.filter((p) => targets.has(p.packageName))) {
    try {
      const wrangler = source.wrangler?.derive("wrangler.deploy.jsonc");
      wrangler?.flattenEnv(request.profile);
      // Validate all selected resources before requesting IDs or writing files.
      for (const database of wrangler?.data.d1_databases ?? []) {
        required.push({
          package: source.packageName,
          name: `${database.database_name}-${request.profile}`,
        });
      }
      prepared.push({ source, wrangler });
    } catch (error) {
      return {
        status: "configuration-failed",
        package: source.packageName,
        reason: `Invalid deployment configuration: ${errorDetail(error, [credentials.token])}`,
      };
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
      if (match.status !== "matched") {
        return {
          ...failure,
          reason: `D1 database ${match.status}: ${resource.name}`,
        };
      }
      ids.set(resource.name, match.id);
    }
  }
  for (const { source, wrangler } of prepared) {
    try {
      const settings = new DeploymentSettings(source.path, request.profile);
      const { connections } = settings.deployment;
      if (wrangler) {
        const snapshot = wrangler.data;
        const variables = resolveVariables(
          { ...snapshot.vars, ...settings.overrides },
          connections.urls,
          request,
          targets,
          workers,
        );
        if (variables.status === "connection-failed") {
          return {
            status: "configuration-failed",
            package: source.packageName,
            reason: variables.reason,
          };
        }
        const services = resolveServiceBindings(
          snapshot.services ?? [],
          connections.bindings,
          request,
          targets,
          workers,
        );
        if (services.status === "connection-failed") {
          return {
            status: "configuration-failed",
            package: source.packageName,
            reason: services.reason,
          };
        }
        wrangler.update({
          name: buildWorkerName(
            source.wrangler!.name,
            request.channel,
            request.prNumber,
          ),
          vars: variables.variables,
          services: services.services,
          ...(snapshot.d1_databases !== undefined
            ? {
                d1_databases: snapshot.d1_databases.map((database) => {
                  const name = `${database.database_name}-${request.profile}`;
                  const id = ids.get(name);
                  if (!id) throw new Error(`Unresolved D1 database: ${name}`);
                  return { ...database, database_name: name, database_id: id };
                }),
              }
            : {}),
          ...(snapshot.r2_buckets !== undefined
            ? {
                r2_buckets: snapshot.r2_buckets.map((bucket) => ({
                  ...bucket,
                  bucket_name: `${bucket.bucket_name}-${request.profile}`,
                })),
              }
            : {}),
        });
        if (request.channel === "preview") wrangler.useWorkersDev();
      }
      const dotenv = new Dotenv(source.path);
      if (dotenv.exists()) {
        const variables = resolveVariables(
          { ...dotenv.variables, ...settings.overrides },
          connections.urls,
          request,
          targets,
          workers,
        );
        if (variables.status === "connection-failed") {
          return {
            status: "configuration-failed",
            package: source.packageName,
            reason: variables.reason,
          };
        }
        dotenv.updateVariables(variables.variables);
        dotenv.derive(".env.production").save();
      }
      wrangler?.save();
    } catch (error) {
      return {
        status: "configuration-failed",
        package: source.packageName,
        reason: `Cannot generate deployment configuration: ${errorDetail(error, [credentials.token])}`,
      };
    }
  }
  return { status: "generated" };
}
