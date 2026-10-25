/** Service identity, with no dependency on a configuration or API response format. */
export type BindingConnection = {
  name: string;
  worker: string;
  package?: string;
};
export type ConnectionDeclarations = {
  bindings: Record<string, string>;
  urls: Record<string, string>;
};
export type Workers = {
  byPackage: ReadonlyMap<string, string>;
  byWorker: ReadonlyMap<string, string>;
};

export type PackageConnections = {
  bindings: BindingConnection[];
  profiles: Partial<Record<"staging" | "release", BindingConnection[]>>;
  declarations: ConnectionDeclarations;
};

/** The same prediction is used by repository sync and deployment planning. */
export function synchronizeBindings(
  bindings: readonly BindingConnection[],
  declarations: Record<string, string>,
  workers: Workers,
): BindingConnection[] {
  for (const name of Object.keys(declarations)) {
    if (!bindings.some((b) => b.name === name))
      throw new Error(`Missing native binding: ${name}`);
    const pkg = declarations[name]!;
    if (!workers.byPackage.has(pkg))
      throw new Error(`No Worker for binding: ${pkg}`);
  }
  return bindings.map((binding) => {
    const declared = Object.hasOwn(declarations, binding.name)
      ? declarations[binding.name]
      : undefined;
    const worker =
      declared === undefined
        ? binding.worker
        : workers.byPackage.get(declared)!;
    const pkg = declared ?? workers.byWorker.get(worker);
    return { name: binding.name, worker, ...(pkg ? { package: pkg } : {}) };
  });
}

export function predictSynchronizedConnections(
  settings: PackageConnections,
  workers: Workers,
): PackageConnections {
  const bindings = synchronizeBindings(
    settings.bindings,
    settings.declarations.bindings,
    workers,
  );
  const profiles: PackageConnections["profiles"] = {};
  for (const profile of ["staging", "release"] as const) {
    const native = settings.profiles[profile];
    if (native)
      profiles[profile] = synchronizeBindings(
        native,
        Object.fromEntries(
          Object.entries(settings.declarations.bindings).filter(([name]) =>
            native.some((b) => b.name === name),
          ),
        ),
        workers,
      );
  }
  return { ...settings, bindings, profiles };
}
