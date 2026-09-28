import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ConnectionGraph } from "./graph.js";
import { validateSources } from "./validation.js";

// Main Logic

function main(): void {
  const { values, positionals: sources } = parseArgs({
    allowPositionals: true,
    options: { graph: { type: "string" } },
  });
  if (!values.graph)
    throw new Error(
      "Usage: tsx tools/connection-graph/select.ts --graph <file|-> [package-name ...]",
    );
  const graph = ConnectionGraph.fromJSON(
    JSON.parse(readFileSync(values.graph === "-" ? 0 : values.graph, "utf8")),
  );
  validateSources(graph, sources);
  console.log(JSON.stringify(graph.selectReviewTargets(sources), null, 2));
}

// EntryPoint

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
