import { parseArgs } from "node:util";
import { ConnectionGraph } from "./graph.js";

try {
  parseArgs({ options: {} });
  console.log(JSON.stringify(ConnectionGraph.fromWorkspace(), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
