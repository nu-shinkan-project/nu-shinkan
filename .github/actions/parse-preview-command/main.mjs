import { readFileSync, appendFileSync } from "node:fs";
import { parsePreviewCommand } from "./input.mjs";

function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const packages = parsePreviewCommand(event.comment?.body);
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `picked=${JSON.stringify(packages)}\n`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
