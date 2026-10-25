import { resolve } from "node:path";
import { Dotenv } from "@repo/app-config/dotenv";
import { DeploymentSettings } from "@repo/app-config/settings";
import {
  serviceConnectionPatch,
  type WranglerJson,
} from "@repo/app-config/wrangler";
import type { WorkspaceConfiguration } from "../workspace/configs.js";
import { buildWorkerName } from "./worker-name.js";
import {
  resolvePlannedVariables,
  type ConnectionPolicy,
} from "./connections.js";
import type { PlannedConnection } from "./connection-plan.js";

export type PreparedPackage = {
  source: WorkspaceConfiguration;
  wrangler?: WranglerJson;
  dotenv?: Dotenv;
  databases: string[];
};

/** Assemble one package from captured settings. External lookups and saving belong to the caller. */
export function assemblePackage(
  source: WorkspaceConfiguration,
  policy: ConnectionPolicy,
  connections: PlannedConnection[],
  shared: Record<string, string>,
): PreparedPackage {
  const settings = new DeploymentSettings(
    source.deployment,
    policy.profile,
    shared,
  );
  const variables = (native: Record<string, string>) => {
    const resolved = resolvePlannedVariables(
      { ...native, ...settings.overrides },
      connections.filter((c) => c.kind === "url"),
      policy.prNumber,
    );
    if (resolved.status === "connection-failed")
      throw new Error(resolved.reason);
    return resolved.variables;
  };
  const wrangler = source.wrangler?.derive("wrangler.deploy.jsonc");
  wrangler?.flattenEnv(policy.profile);
  if (wrangler) {
    const snapshot = wrangler.data;
    wrangler.update({
      name: buildWorkerName(
        source.wrangler!.name,
        policy.channel,
        policy.prNumber,
      ),
      vars: variables(snapshot.vars ?? {}),
      ...serviceConnectionPatch(
        connections
          .filter((c) => c.kind === "binding")
          .map((c) => ({
            name: c.name,
            worker: buildWorkerName(c.worker!, c.channel, policy.prNumber),
          })),
      ),
      ...(snapshot.d1_databases !== undefined
        ? {
            d1_databases: snapshot.d1_databases.map((d) => ({
              ...d,
              database_name: `${d.database_name}-${policy.profile}`,
            })),
          }
        : {}),
      ...(snapshot.r2_buckets !== undefined
        ? {
            r2_buckets: snapshot.r2_buckets.map((b) => ({
              ...b,
              bucket_name: `${b.bucket_name}-${policy.profile}`,
            })),
          }
        : {}),
    });
    if (policy.channel === "preview") wrangler.useWorkersDev();
  }
  const dotenv =
    source.dotenv === undefined
      ? undefined
      : Dotenv.fromVariables(
          resolve(source.path, ".env.production"),
          variables(source.dotenv),
        );
  return {
    source,
    wrangler,
    dotenv,
    databases: (wrangler?.data.d1_databases ?? []).map((d) => d.database_name),
  };
}

export function applyDatabaseIds(
  prepared: PreparedPackage,
  ids: ReadonlyMap<string, string>,
): void {
  const databases = prepared.wrangler?.data.d1_databases;
  if (databases)
    prepared.wrangler!.update({
      d1_databases: databases.map((d) => {
        const id = ids.get(d.database_name);
        if (!id) throw new Error(`Unresolved D1 database: ${d.database_name}`);
        return { ...d, database_id: id };
      }),
    });
}
