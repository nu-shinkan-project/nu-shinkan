#!/usr/bin/env node
import { WranglerJsonc } from "@repo/app-config/wrangler";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function deletePreviewWorker(): Promise<void> {
  const prNumber = process.env.PR_NUMBER;
  if (
    !prNumber ||
    !/^[1-9][0-9]*$/.test(prNumber) ||
    !Number.isSafeInteger(Number(prNumber))
  )
    throw new Error("PR_NUMBER must be a positive integer");
  const workerName = new WranglerJsonc().name;
  if (
    typeof workerName !== "string" ||
    !/^[a-z0-9][a-z0-9-]*$/.test(workerName)
  )
    throw new Error("Invalid Worker name");
  const previewWorkerName = `${workerName}-preview-pr-${prNumber}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const output = execFileSync(
        "pnpm",
        ["exec", "wrangler", "delete", previewWorkerName, "--force"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      process.stdout.write(output);
      return;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      // Wrangler distinguishes missing Workers and missing legacy environments.
      if (/\[code: (10007|10090)\]/.test(detail)) {
        console.log(`Preview Worker ${previewWorkerName} is already absent.`);
        return;
      }
      if (attempt === 3) throw error;
      console.warn(
        `Deletion failed for ${previewWorkerName}; retry ${attempt}/3: ${detail}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  deletePreviewWorker().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
