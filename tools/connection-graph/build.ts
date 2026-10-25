import { parseArgs } from "node:util";
import { readConnectionGraph } from "../workspace/graph.js";
import { findWorkspaceRoot } from "../workspace/root.js";

try {
  parseArgs({ options: {} });
  console.log(
    JSON.stringify(await readConnectionGraph(findWorkspaceRoot()), null, 2),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
