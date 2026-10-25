# Workspaceの接続処理

Workspace内の接続宣言、Service Bindingの解決、review用グラフを扱う。CLIの利用方法は[README](README.md)を参照する。

- `resolve.ts` は設定形式に依存しない接続情報の型、Bindingの接続先解決、同期結果の予測を提供する。取得済みの接続情報とWorker対応表を受け取り、ファイルの取得・保存は行わない。
- `graph.ts` の `ConnectionGraph` は取得済みの接続宣言からグラフを構築し、review対象を選定する。設定ファイルやWorkspace一覧の取得は行わない。
- `read.ts` の `readConnectionGraph(root)` はWorkspace一覧とdeployment設定を取得してグラフを構築する。`readPackageConnections(source)` は取得済みの設定から、Binding・profile上書き・接続宣言を取り出す。
- `build.ts` / `select.ts` はCLIの引数・入出力・終了処理を担当する。

パッケージ一覧は親ディレクトリの `packages.ts`、一般的な設定収集とWorker対応表は `configs.ts` が担当する。デプロイ先channelの選択とpreviewの接続方針は `tools/deploy/`、同期の取りまとめと保存の進行管理は `tools/sync-env/` に置く。

`ConnectionGraph.fromDeployments(packages, deployments)` は取得済みの接続宣言から構築し、`fromJSON(value)` はJSONを検証・復元する。`selectReviewTargets(sources)` がreview対象を返し、`toJSON()` は `{ packages, edges, reviewEntries }` を返す。

接続先・呼び出し元の隣接リストは構築時に一度だけ生成する。入力・返却データをコピーし、外部からの変更で探索結果が変わらないようにする。グラフはパッケージ名だけをノードとして保持し、pathやWorker名は持たない。計画側が選定された名前をWorkspaceのパッケージ情報に対応づける。

接続解決とグラフのテストには取得済みのデータを渡す。検証対象の判断は[テスト方針](../../../docs/policy/testing.md)に従い、CLIエントリーポイントは起動・importしない。
