#!/usr/bin/env node
import { parseArgs } from "node:util";
import { GlobalRuntimeEnvsYaml } from "./config-file/globalRuntimeEnvs.yaml.js";
import { syncPackageLocal } from "./config-file/sync-local.js";
try {
  const { values } = parseArgs({
    options: { "dry-run": { type: "boolean" }, check: { type: "boolean" } },
  });
  syncPackageLocal(
    new GlobalRuntimeEnvsYaml().local,
    values["dry-run"] || values.check,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
