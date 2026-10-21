import { runCleanup } from "./run-cleanup.js";
try {
  process.exitCode = await runCleanup(process.argv.slice(2), process.env);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
