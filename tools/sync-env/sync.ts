import { findWorkspaceRoot } from "../workspace/root.js";
import { parseArgs } from "node:util";
import { syncRepository } from "./repository.js";

try {
  const { values } = parseArgs({
    options: {
      root: { type: "string" },
      filter: { type: "string", multiple: true },
      "dry-run": { type: "boolean" },
      check: { type: "boolean" },
    },
  });
  await syncRepository(findWorkspaceRoot(values.root), {
    dryRun: values["dry-run"] || values.check,
    filters: values.filter,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
