import { DeploymentYaml, type Deployment } from "@repo/app-config/deployment";
import { getWorkspaceConfigurations } from "../workspace/configs.js";
import { findWorkspaceRoot } from "../workspace/root.js";

export type ConnectionGraphJSON = {
  packages: string[];
  edges: [string, string][];
  reviewEntries: string[];
};

/** 呼び出し元→接続先のグラフ。workspace・設定・JSONから構築する。 */
export class ConnectionGraph {
  #data: ConnectionGraphJSON;
  #destinations: Map<string, Set<string>>;
  #callers: Map<string, Set<string>>;

  // Main Logic

  /** 省略時はこのcheckoutを読み取る。rootの指定は内部のテスト用。 */
  static fromWorkspace(
    root = findWorkspaceRoot(import.meta.dirname),
  ): ConnectionGraph {
    const packages = getWorkspaceConfigurations(root);
    return ConnectionGraph.fromDeployments(
      packages.map((pkg) => pkg.packageName),
      new Map(
        packages.map((pkg) => [pkg.packageName, new DeploymentYaml(pkg.path)]),
      ),
    );
  }

  static fromDeployments(
    packages: string[],
    configs: ReadonlyMap<string, Deployment>,
  ): ConnectionGraph {
    const names = new Set(packages);
    if (names.size !== packages.length)
      throw new Error("Duplicate workspace package name");
    const edges: [string, string][] = [];
    const reviewEntries: string[] = [];
    for (const source of packages) {
      const config = configs.get(source);
      if (!config) continue;
      if (config.reviewEntry) reviewEntries.push(source);
      // URLとBindingが同じ接続先を指していても、探索用の辺は一つにする。
      const destinations = new Set([
        ...Object.values(config.connections.bindings),
        ...Object.values(config.connections.urls),
      ]);
      // 設定と同じ向きで保持する（WebがAPIに接続するならWeb→API）。
      for (const target of destinations)
        if (target !== source && names.has(target))
          edges.push([source, target]);
    }
    return new ConnectionGraph({ packages, edges, reviewEntries });
  }

  static fromJSON(value: unknown): ConnectionGraph {
    if (!value || typeof value !== "object")
      throw new Error("Invalid connection graph");
    const graph = value as ConnectionGraphJSON;
    if (
      !Array.isArray(graph.packages) ||
      !graph.packages.every(
        (name) => typeof name === "string" && name.length > 0,
      ) ||
      !Array.isArray(graph.edges) ||
      !graph.edges.every(
        (edge) =>
          Array.isArray(edge) &&
          edge.length === 2 &&
          edge.every((name) => typeof name === "string"),
      ) ||
      !Array.isArray(graph.reviewEntries) ||
      !graph.reviewEntries.every((name) => typeof name === "string")
    )
      throw new Error("Invalid connection graph");
    const names = new Set(graph.packages);
    if (names.size !== graph.packages.length)
      throw new Error("Duplicate workspace package name");
    return new ConnectionGraph(graph);
  }

  hasPackage(name: string): boolean {
    return this.#destinations.has(name);
  }

  /** 起点は依存関係の影響先まで展開済みとする。結果はworkspace順で返す。 */
  selectReviewTargets(sources: Iterable<string>): string[] {
    // 起点から呼び出し元へ逆向きに辿り、入口から接続先へ辿れる集合との積を取る。
    const fromSources = collectReachable(this.#callers, sources);
    const toEntries = collectReachable(
      this.#destinations,
      this.#data.reviewEntries,
    );
    return this.#data.packages.filter(
      (name) => fromSources.has(name) && toEntries.has(name),
    );
  }

  toJSON(): ConnectionGraphJSON {
    // 呼び出し側の変更が内部グラフへ波及しないようコピーを返す。
    return structuredClone(this.#data);
  }

  // Helper

  private constructor(data: ConnectionGraphJSON) {
    this.#data = structuredClone(data);
    // 隣接リストは生成時に一度だけ作り、繰り返しの選定で再利用する。
    const destinations = new Map(
      this.#data.packages.map((p) => [p, new Set<string>()]),
    );
    const callers = new Map(
      this.#data.packages.map((p) => [p, new Set<string>()]),
    );
    for (const [from, to] of this.#data.edges) {
      if (from === to || !destinations.has(from) || !destinations.has(to))
        continue;
      destinations.get(from)!.add(to);
      callers.get(to)!.add(from);
    }
    this.#destinations = destinations;
    this.#callers = callers;
  }
}

// Helper

function collectReachable(
  graph: Map<string, Set<string>>,
  starts: Iterable<string>,
): Set<string> {
  // 訪問済み管理で循環を止め、再帰を使わず長い経路にも対応する。
  const seen = new Set<string>();
  const stack = [...starts].filter((name) => graph.has(name));
  while (stack.length) {
    const name = stack.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const next of graph.get(name) ?? [])
      if (!seen.has(next)) stack.push(next);
  }
  return seen;
}
