import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
export function findWorkspaceRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (!existsSync(join(current, "pnpm-workspace.yaml"))) {
    const parent = dirname(current);
    if (parent === current) throw new Error("pnpm-workspace.yaml not found");
    current = parent;
  }
  return current;
}
