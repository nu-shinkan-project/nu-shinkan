import { api, type Cloudflare } from "./cloudflare.js";

export type Removal = {
  worker: string;
  status: "deleted" | "delete-failed";
  reason?: string;
};
export type Cleanup =
  | { status: "invalid-request" | "list-failed"; reason: string }
  | {
      status: "cleaned";
      outcome: "success" | "partial-failure" | "failure";
      targets: string[];
      results: Removal[];
    };

export function selectPreviewWorkers(
  workers: string[],
  prNumber: number,
): string[] {
  const suffix = `-preview-${prNumber}`;
  return [...new Set(workers.filter((name) => name.endsWith(suffix)))].sort();
}
export async function cleanup(
  prNumber: number,
  credentials: Cloudflare,
): Promise<Cleanup> {
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0)
    return {
      status: "invalid-request",
      reason: "PR number must be a positive integer",
    };
  console.log(`[cleanup] Listing deployed Workers for PR ${prNumber}`);
  // This endpoint returns a single complete list, rather than a paginated list.
  const listing = await api(credentials, "workers/scripts");
  if (listing.status === "api-failed")
    return { status: "list-failed", reason: listing.reason };
  if (
    !Array.isArray(listing.result) ||
    listing.result.some(
      (worker) => !worker || typeof worker.id !== "string" || !worker.id,
    )
  )
    return {
      status: "list-failed",
      reason: "Invalid Worker list; no deletion attempted",
    };
  const targets = selectPreviewWorkers(
    listing.result.map((worker) => worker.id),
    prNumber,
  );
  console.log(
    `[cleanup] Listed ${listing.result.length} Workers; selected ${targets.length} by exact suffix.`,
  );
  const results: Removal[] = [];
  for (const worker of targets) {
    const response = await api(
      credentials,
      `workers/scripts/${encodeURIComponent(worker)}?force=true`,
      "DELETE",
    );
    results.push(
      response.status === "received"
        ? { worker, status: "deleted" }
        : { worker, status: "delete-failed", reason: response.reason },
    );
    console.log(`[cleanup] ${worker}: ${results.at(-1)!.status}`);
  }
  const failures = results.filter((r) => r.status === "delete-failed").length;
  return {
    status: "cleaned",
    outcome:
      failures === 0
        ? "success"
        : failures === results.length
          ? "failure"
          : "partial-failure",
    targets,
    results,
  };
}
export function cleanupMarkdown(result: Cleanup, prNumber: number): string {
  const lines = [`# Preview cleanup: PR ${prNumber}`, ""];
  if (result.status !== "cleaned")
    lines.push(`${result.status}: ${result.reason}`);
  else {
    lines.push(`Result: ${result.outcome}`, "");
    if (!result.targets.length) lines.push("No matching Workers.");
    else {
      lines.push("| Worker | Result | Detail |", "| --- | --- | --- |");
      for (const removal of result.results)
        lines.push(
          `| ${removal.worker} | ${removal.status} | ${removal.reason ?? ""} |`,
        );
    }
  }
  return lines.join("\n") + "\n";
}
