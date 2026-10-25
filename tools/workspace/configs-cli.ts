import { listPackages } from "./packages.js";
import { findWorkspaceRoot } from "./root.js";
import { parseArgs } from "node:util";
import { getWorkspaceConfigurations } from "./configs.js";
import { selectWorkspaceConfigurations } from "./selection.js";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { root: { type: "string" } },
  });
  const root = findWorkspaceRoot(values.root);
  const configurations = getWorkspaceConfigurations(
    root,
    await listPackages(root),
  );
  const selected = selectWorkspaceConfigurations(
    configurations,
    positionals.length ? positionals : undefined,
  );
  console.log(JSON.stringify(selected));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
