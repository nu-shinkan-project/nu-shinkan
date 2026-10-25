import { readFileSync } from "node:fs";
import { isAbsolute, resolve, relative } from "node:path";
import { command } from "../command.js";
import { commandFailure } from "../diagnostics.js";
import type { Package } from "./types.js";

type ListedPackage = { name: string; path: string };

export function parseInventory(value: unknown): ListedPackage[] {
  const items = (value as { packages?: { items?: unknown } })?.packages?.items;
  if (!Array.isArray(items)) throw new Error("Invalid Turbo inventory");
  const names = new Set<string>();
  return items.map((item) => {
    if (
      typeof item?.name !== "string" ||
      !item.name ||
      typeof item?.path !== "string" ||
      !item.path ||
      item.path === "." ||
      isAbsolute(item.path) ||
      item.path.split(/[\\/]/).includes("..") ||
      names.has(item.name)
    )
      throw new Error("Invalid or duplicate Turbo package");
    names.add(item.name);
    return { name: item.name, path: item.path };
  });
}

/** Enumerate Turbo workspaces without loading native configuration files. */
export async function listPackages(root: string): Promise<Package[]> {
  const listing = await command(
    "pnpm",
    ["exec", "turbo", "ls", "--output=json"],
    root,
    true,
  );
  if (listing.status !== "completed" || listing.code !== 0)
    throw new Error(commandFailure(listing, "Turbo inventory failed"));
  const packages = parseInventory(JSON.parse(listing.stdout));
  return packages.map((pkg) => {
    const path = relative(root, resolve(root, pkg.path)).replaceAll("\\", "/");
    const manifest = JSON.parse(
      readFileSync(resolve(root, path, "package.json"), "utf8"),
    );
    return { name: pkg.name, path, scripts: manifest.scripts ?? {} };
  });
}

/** Select from the captured inventory; only dependency expansion queries Turbo again. */
export async function selectWithDependents(
  root: string,
  packages: Package[],
  names?: string[],
  dependents = false,
): Promise<Package[]> {
  if (names?.length === 0) return [];
  let selected = selectPackages(packages, names);
  if (names && dependents) {
    const expanded = await command(
      "pnpm",
      [
        "exec",
        "turbo",
        "ls",
        "--output=json",
        ...names.map((n) => `--filter=...${n}`),
      ],
      root,
      true,
    );
    if (expanded.status !== "completed" || expanded.code !== 0)
      throw new Error(
        commandFailure(expanded, "Turbo dependency selection failed"),
      );
    const expandedNames = new Set(
      parseInventory(JSON.parse(expanded.stdout)).map((p) => p.name),
    );
    selected = packages.filter((p) => expandedNames.has(p.name));
  }
  return selected;
}

export function selectPackages<T extends { name: string }>(
  packages: T[],
  names?: string[],
): T[] {
  const unknown = names?.filter(
    (name) => !packages.some((p) => p.name === name),
  );
  if (unknown?.length)
    throw new Error(`Unknown packages: ${unknown.join(", ")}`);
  return names ? packages.filter((p) => names.includes(p.name)) : packages;
}

/** Turbo owns filter syntax, exclusions and dependency expansion. */
export async function selectFilteredPackages(
  root: string,
  packages: Package[],
  filters: string[],
): Promise<Package[]> {
  if (!filters.length) return packages;
  const run = await command(
    "pnpm",
    [
      "exec",
      "turbo",
      "ls",
      "--output=json",
      ...filters.map((f) => `--filter=${f}`),
    ],
    root,
    true,
  );
  if (run.status !== "completed" || run.code !== 0)
    throw new Error(commandFailure(run, "Turbo filter selection failed"));
  return selectPackages(
    packages,
    parseInventory(JSON.parse(run.stdout)).map((p) => p.name),
  );
}
