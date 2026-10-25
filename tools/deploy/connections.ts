import type { PlannedConnection } from "./connection-plan.js";
import { buildWorkerName } from "./worker-name.js";

export type ConnectionPolicy = {
  channel: "preview" | "staging" | "release";
  profile: "staging" | "release";
  prNumber: number;
};

export function resolvePlannedVariables(
  values: Record<string, string>,
  connections: readonly PlannedConnection[],
  prNumber: number,
):
  | { status: "resolved"; variables: Record<string, string> }
  | { status: "connection-failed"; reason: string } {
  const variables = { ...values };
  for (const connection of connections) {
    const key = connection.name;
    if (connection.channel !== "preview" && values[key]) continue;
    if (!connection.worker)
      return {
        status: "connection-failed",
        reason: `No Worker for URL connection: ${connection.package}`,
      };
    let url: URL;
    try {
      url = new URL(values[key] || "https://placeholder/");
    } catch {
      return {
        status: "connection-failed",
        reason: `Invalid URL for connection: ${key}`,
      };
    }
    url.protocol = "https:";
    url.hostname = `${buildWorkerName(connection.worker, connection.channel, prNumber)}.nushinkan2.workers.dev`;
    url.port = "";
    variables[key] = url.toString();
  }
  return { status: "resolved", variables };
}
