import { errorDetail } from "../diagnostics.js";
import { run } from "./run.js";
try {
  process.exitCode = await run("update", process.argv.slice(2));
} catch (error) {
  console.error(errorDetail(error, [], true));
  process.exitCode = 1;
}
