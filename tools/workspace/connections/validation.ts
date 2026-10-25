import type { ConnectionGraph } from "./graph.js";

/** 入力名はすべて登録済みであること。探索側の未知起点を無視する規則とは別。 */
export function validateSources(
  graph: ConnectionGraph,
  sources: string[],
): void {
  const unknown: string[] = [];
  for (const name of sources) {
    if (!graph.hasPackage(name)) unknown.push(name);
  }
  if (unknown.length)
    throw new Error(`Unknown packages: ${unknown.join(", ")}`);
}
