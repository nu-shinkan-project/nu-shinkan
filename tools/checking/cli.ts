import { parseArgs } from "node:util";
import { findWorkspaceRoot } from "../workspace/root.js";
import { errorDetail } from "../diagnostics.js";
import { listPackages, selectPackages } from "../workspace/packages.js";
import { runChecks } from "./run.js";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      package: { type: "string", multiple: true },
      task: { type: "string", multiple: true },
    },
  });
  const root = findWorkspaceRoot();
  if (positionals.length !== 1)
    throw new Error(
      "Usage: checking <list|run> [--package <name>] [--task <test|lint|ui_test>]",
    );
  switch (positionals[0]) {
    case "list":
      if (values.task) throw new Error("--task is only supported by run");
      console.log(
        JSON.stringify(
          selectPackages(await listPackages(root), values.package),
        ),
      );
      break;
    case "run":
      process.exitCode = await runChecks(root, values.package, values.task);
      break;
    default:
      throw new Error("Expected list or run");
  }
} catch (error) {
  console.error(errorDetail(error));
  process.exitCode = 1;
}
