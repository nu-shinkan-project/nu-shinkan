import {
  predictSynchronizedConnections,
  synchronizeBindings,
  type PackageConnections,
  type Workers,
} from "../workspace/connections.js";
import type { ConnectionPolicy } from "./connections.js";

export type PlannedConnection = {
  source: string;
  kind: "binding" | "url";
  name: string;
  package?: string;
  worker?: string;
  channel: ConnectionPolicy["channel"];
  profile: ConnectionPolicy["profile"];
};

export function planConnections(
  settings: ReadonlyMap<string, PackageConnections>,
  workers: Workers,
  policy: ConnectionPolicy,
  targets: ReadonlySet<string>,
  {
    predictSync = false,
    sources = targets,
  }: { predictSync?: boolean; sources?: ReadonlySet<string> } = {},
): PlannedConnection[] {
  const result: PlannedConnection[] = [];
  const destination = (pkg?: string) =>
    policy.channel === "preview" && pkg !== undefined && targets.has(pkg)
      ? "preview"
      : policy.profile;
  for (const source of sources) {
    const original = settings.get(source);
    if (!original) throw new Error(`Missing connection settings: ${source}`);
    const config = predictSync
      ? predictSynchronizedConnections(original, workers)
      : original;
    synchronizeBindings(
      config.profiles[policy.profile] ?? config.bindings,
      config.declarations.bindings,
      workers,
    );
    // Saved native destinations are authoritative after sync. A declaration cannot hide stale services.
    const bindings = synchronizeBindings(
      config.profiles[policy.profile] ?? config.bindings,
      {},
      workers,
    );
    if (!predictSync)
      for (const binding of bindings) {
        const declared = config.declarations.bindings[binding.name];
        if (
          Object.hasOwn(config.declarations.bindings, binding.name) &&
          workers.byPackage.get(declared!) !== binding.worker
        )
          throw new Error("Connection configuration changed after planning");
      }
    for (const binding of bindings)
      result.push({
        source,
        kind: "binding",
        name: binding.name,
        worker: binding.worker,
        package: binding.package,
        channel: destination(binding.package),
        profile: policy.profile,
      });
    for (const [name, pkg] of Object.entries(config.declarations.urls))
      result.push({
        source,
        kind: "url",
        name,
        worker: workers.byPackage.get(pkg),
        package: pkg,
        channel: destination(pkg),
        profile: policy.profile,
      });
  }
  return result;
}

export function connectionSignature(
  connections: readonly PlannedConnection[],
): string {
  return JSON.stringify(
    connections
      .map((c) => [
        c.source,
        c.kind,
        c.name,
        c.package ?? null,
        c.worker ?? null,
        c.channel,
        c.profile,
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}
