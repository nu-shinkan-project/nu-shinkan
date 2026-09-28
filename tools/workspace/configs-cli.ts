import { parseArgs } from "node:util";
import { getWorkspaceConfigurations } from "./configs.js";
import { selectWorkspaceConfigurations } from "./selection.js";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { root: { type: "string" }, targets: { type: "boolean" } },
  });
  const configurations = getWorkspaceConfigurations(values.root);
  const selected = selectWorkspaceConfigurations(configurations, positionals, {
    targets: values.targets,
  });
  console.log(JSON.stringify(selected));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
