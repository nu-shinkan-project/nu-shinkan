import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { WranglerConfig, WranglerPatch } from "./wrangler-types.js";

/** Independent JSON configuration, with no knowledge of its consumer. */
export class WranglerJson {
  private readonly path: string;
  private config: WranglerConfig;
  private validated = false;

  constructor(path: string, config: WranglerConfig) {
    this.path = resolve(path);
    this.config = structuredClone(config);
  }

  get data(): WranglerConfig {
    if (!this.validated) {
      validateResources(this.config);
      this.validated = true;
    }
    return structuredClone(this.config);
  }

  flattenEnv(profile: "staging" | "release"): void {
    // Select before validation: unused or replaced resources must not fail.
    const { env, ...base } = this.config;
    const selected = env?.[profile] ?? {};
    this.config = {
      ...base,
      ...selected,
      vars: { ...base.vars, ...selected.vars },
    };
    this.validated = false;
  }

  update(values: WranglerPatch): void {
    const { name, vars, env, services, ...rest } = structuredClone(values);
    if (name !== undefined) this.config.name = name;
    if (vars !== undefined) {
      for (const [key, value] of Object.entries(vars)) {
        if (value === null) {
          if (this.config.vars) delete this.config.vars[key];
        } else {
          (this.config.vars ??= {})[key] = value;
        }
      }
    }
    if (env !== undefined) {
      for (const [key, value] of Object.entries(env)) {
        (this.config.env ??= {})[key] = value;
      }
    }
    // Match JSONC's binding updates, preserving order and existing attributes.
    const pending = new Map(
      (services ?? []).map(({ binding, service }) => [binding, service]),
    );
    for (const binding of this.config.services ?? []) {
      if (pending.has(binding.binding)) {
        binding.service = pending.get(binding.binding)!;
        pending.delete(binding.binding);
      }
    }
    for (const [binding, service] of pending) {
      (this.config.services ??= []).push({ binding, service });
    }
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) this.config[key] = value;
    }
    this.validated = false;
  }

  useWorkersDev(): void {
    delete this.config.route;
    delete this.config.routes;
    this.config.workers_dev = true;
  }

  save(dryRun = false): void {
    const content = JSON.stringify(this.data, null, 2) + "\n";
    if (dryRun) {
      console.log(`[dry-run] would save ${this.path}:\n${content}`);
    } else {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, content, "utf-8");
    }
  }
}

function validateResources(config: WranglerConfig): void {
  for (const [field, name] of [
    ["d1_databases", "database_name"],
    ["r2_buckets", "bucket_name"],
  ] as const) {
    const entries = config[field];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) throw new Error(`${field} must be an array`);
    for (const [index, entry] of entries.entries()) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`${field}[${index}] must be an object`);
      }
      for (const key of ["binding", name]) {
        if (typeof entry[key] !== "string" || !entry[key].trim()) {
          throw new Error(
            `${field}[${index}].${key} must be a non-empty string`,
          );
        }
      }
      if (
        field === "d1_databases" &&
        entry.database_id !== undefined &&
        typeof entry.database_id !== "string"
      ) {
        throw new Error(`${field}[${index}].database_id must be a string`);
      }
    }
  }
}
