import type { BindingConnection } from "../workspace/connections.js";

type Variables = Record<string, string>;
export type ConnectionPolicy = {
  channel: "preview" | "staging" | "release";
  profile: "staging" | "release";
  prNumber: number;
};
import { buildWorkerName } from "./worker-name.js";

export function resolveVariables(
  values: Variables,
  connections: Record<string, string>,
  request: ConnectionPolicy,
  targets: ReadonlySet<string>,
  workers: ReadonlyMap<string, string>,
):
  | { status: "resolved"; variables: Variables }
  | { status: "connection-failed"; reason: string } {
  const result = { ...values };
  for (const [key, pkg] of Object.entries(connections)) {
    const preview = request.channel === "preview" && targets.has(pkg);
    if (!preview && values[key]) continue;
    const worker = workers.get(pkg);
    if (!worker)
      return {
        status: "connection-failed",
        reason: `No Worker for URL connection: ${pkg}`,
      };
    const destination = preview ? request.channel : request.profile;
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
    url.hostname = `${buildWorkerName(worker, destination, request.prNumber)}.nushinkan2.workers.dev`;
    url.port = "";
    result[key] = url.toString();
  }
  return { status: "resolved", variables: result };
}

export function resolveBindingConnections(
  bindings: BindingConnection[],
  connections: Record<string, string>,
  request: ConnectionPolicy,
  targets: ReadonlySet<string>,
  workers: ReadonlyMap<string, string>,
):
  | { status: "resolved"; connections: BindingConnection[] }
  | { status: "connection-failed"; reason: string } {
  const resolved: BindingConnection[] = [];
  for (const binding of bindings) {
    const pkg = connections[binding.name];
    const preview =
      request.channel === "preview" && pkg !== undefined && targets.has(pkg);
    const bare = preview ? workers.get(pkg) : binding.worker;
    if (!bare)
      return {
        status: "connection-failed",
        reason: `No Worker for binding: ${pkg}`,
      };
    resolved.push({
      ...binding,
      worker: buildWorkerName(
        bare,
        preview ? request.channel : request.profile,
        request.prNumber,
      ),
    });
  }
  for (const binding of Object.keys(connections)) {
    if (!resolved.some((s) => s.name === binding)) {
      return {
        status: "connection-failed",
        reason: `Missing native binding: ${binding}`,
      };
    }
  }
  return { status: "resolved", connections: resolved };
}
