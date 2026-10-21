import { run } from "./run.js";
try {
  process.exitCode = await run("manual-pick", process.argv.slice(2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
