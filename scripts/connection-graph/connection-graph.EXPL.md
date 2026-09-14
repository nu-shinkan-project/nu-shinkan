# 接続グラフの内部構成

接続グラフの実装を読むための説明。利用方法は [README](README.md) を参照する。

`ConnectionGraph` はグラフデータと探索を保持する。`fromWorkspace(root?)` でworkspaceの設定を読み取って構築する。読み取り済みの設定には `fromDeployments(packages, deployments)` を使い、`fromJSON(value)` で検証・復元する。`selectReviewTargets(sources)` がreview対象を返し、`toJSON()` は `{ packages, edges, reviewEntries }` を返す。

接続先（destinations）・呼び出し元（callers）の隣接リストは構築時に一度だけ生成する。入力・返却データをコピーし、外部からの変更で探索結果が変わらないようにする。workspace設定の収集は `workspace/configs.ts`、deploymentファイルの読み取りは `ConnectionGraph.fromWorkspace()`、`build.ts` はCLIの引数検証・JSON出力・エラー処理、`select.ts` は入力JSONの読み取り・引数検証・選定結果の出力を担当する。

グラフはパッケージ名だけをノードとして保持し、pathやWorker名は持たない。計画側が選定された名前をworkspaceのパッケージ情報に対応づけ、Worker名を付与して最終的なtargetsを作る。

workspace読み取りのテストでは、`ConnectionGraph.fromWorkspace(root)` に一時workspaceを渡す。検証対象の判断は[テスト方針](../../docs/policy/testing-policy.md)に従い、CLIエントリーポイントは起動・importしない。
