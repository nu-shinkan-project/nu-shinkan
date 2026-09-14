# Connection graph

[デプロイ設計](../../docs/design/deploy-design.md#review-に共通の-connection-グラフ)の review 用対象選定を、独立した CLI として提供する。リポジトリルートで実行する。

キャッシュ可能性を考慮し，エントリーポイントとして，`build.ts`と`select.ts`を提供している．

```sh
pnpm exec tsx scripts/connection-graph/build.ts > connection-graph.json
pnpm exec tsx scripts/connection-graph/select.ts \
  --graph connection-graph.json \
  @repo/dummy-preview-api > targets.json
```

ファイルを保存せず、パイプでも接続できる。`--graph -` は標準入力を読む。

```sh
set -o pipefail
pnpm exec tsx scripts/connection-graph/build.ts |
  pnpm exec tsx scripts/connection-graph/select.ts --graph - @repo/dummy-preview-api
```

両 CLI とも結果の JSON を標準出力、警告・エラーを標準エラー出力へ書く。エラー時は終了コード 1。ファイルの保存先や GitHub Actions artifact へのアップロードは呼び出し側で決める。

## build.ts

このリポジトリ専用で、CLI引数は受け付けない。`graph.ts` 自身の配置からpnpm workspaceルートを特定するため、カレントディレクトリによらず同じcheckoutを対象にする。

全パッケージの `deployment.yaml` を既存の app-config ローダーで読み、`connections.bindings` / `urls` を接続元 → 接続先の辺に変換する。自己ループ・不明な接続先は無視し、重複する辺をまとめる。設定省略・不正な `reviewEntry` の扱いもローダーに従う。

出力の形式は次のとおり。

```json
{
  "packages": ["api", "web"],
  "edges": [["web", "api"]],
  "reviewEntries": ["web"]
}
```

## select.ts

`--graph <file|->` は必須。残りの引数に起点のパッケージ名を渡す。起点が空なら空配列、不明な名前や不正なグラフ JSON はエラーになる。

起点から呼び出し元へ逆向きに辿れる集合と、review入口から接続先へ正向きに辿れる集合の積を返す。循環を含め反復探索し、入口自身の長さ 0 の経路も含める。出力はパッケージ名の `string[]` で入力グラフのパッケージ順を維持する。

起点には呼び出し側でパッケージ依存関係による影響先まで含める。差分検出・manual-pick の受付・`scripts.deploy` による実行対象の絞り込みは呼び出し側の責務とする。
