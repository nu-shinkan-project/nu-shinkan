import { existsSync, globSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import YAML from "yaml";
import { WranglerJsonc } from "@repo/app-config/wrangler";
import { Dotenv } from "@repo/app-config/dotenv";
import { findWorkspaceRoot } from "./root.js";

export type WorkspaceConfiguration = {
  packageName: string;
  path: string;
  pathRel: string;
  wrangler?: WranglerJsonc;
  dotenv?: Record<string, string>;
};

export function getWorkspaceConfigurations(
  root = findWorkspaceRoot(),
): WorkspaceConfiguration[] {
  root = findWorkspaceRoot(root);
  const { packages } = YAML.parse(
    readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8"),
  );
  if (
    !Array.isArray(packages) ||
    packages.some((p) => typeof p !== "string" || !p)
  )
    throw new Error("workspace packages must be an array of patterns");
  const excluded = packages
    .filter((p) => p.startsWith("!"))
    .map((p) => p.slice(1));
  const directories = globSync(
    packages.filter((p) => !p.startsWith("!")),
    {
      cwd: root,
      exclude: ["**/node_modules/**", "**/.git/**", ...excluded],
    },
  );
  const names = new Set<string>();
  return [...new Set(directories)].sort().flatMap((directory) => {
    const path = resolve(root, directory);
    const pathRel = relative(root, path).replaceAll("\\", "/");
    if (!pathRel || pathRel.startsWith("../") || isAbsolute(pathRel)) return [];
    const manifestPath = resolve(path, "package.json");
    if (!existsSync(manifestPath)) return [];
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (typeof manifest.name !== "string" || !manifest.name.trim())
      throw new Error(`Missing package name: ${pathRel}`);
    if (names.has(manifest.name))
      throw new Error(`Duplicate package name: ${manifest.name}`);
    names.add(manifest.name);
    const wrangler = new WranglerJsonc(path);
    const dotenv = new Dotenv(path);
    return [
      {
        packageName: manifest.name,
        path,
        pathRel,
        ...(wrangler.exists() ? { wrangler } : {}),
        ...(dotenv.exists() ? { dotenv: dotenv.variables } : {}),
      },
    ];
  });
}
