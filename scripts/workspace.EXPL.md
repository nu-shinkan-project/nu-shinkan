# リポジトリ全体の処理

`packages/app-config` は単一パッケージの設定を読み取り、変換・生成する。`scripts/` はworkspace全体の設定収集、接続グラフ、設定同期を担当する。Node.js 24以上とpnpmを準備し、リポジトリルートで依存をインストールしてから実行する。app-configの利用には公開APIを使う。

## Workspace設定

`workspace/root.ts` はカレントディレクトリから親を辿ってpnpm workspaceルートを探す。`workspace/configs.ts` の `getWorkspaceConfigurations(root?)` は `pnpm-workspace.yaml` のパターンと除外指定に従い、パッケージ名、絶対パス `path`、ルート相対パス `pathRel`、存在するWrangler・dotenv設定を返す。重複パッケージ名はエラーになる。

```sh
pnpm exec tsx scripts/workspace/configs-cli.ts [--root <directory>]
pnpm exec tsx scripts/workspace/configs-cli.ts --targets @repo/dummy-preview-api
```

通常のCLI出力は設定一覧で、Wranglerの内容をJSON化する。dotenvはapp-configと同じく `VITE_` 接頭辞の値だけを扱い、接頭辞を外す。設定値を含むため、一覧全体をActionsのログへ出す必要はない。

`--targets` は後続の正確なパッケージ名を `{ package, path, workerName? }[]` に変換する。pathはworkspace相対、Worker名は基底名。名前の指定がなければ空配列となり、不明な名前・不正なWorker名はエラーになる。ワークフローはデプロイ可能な名前を選定してからこのCLIを呼び、結果をbuild/deployの `TARGETS` へ渡す。

## 接続と設定同期

- `connection-graph/build.ts` / `select.ts`: [接続グラフの構築とreview対象選定](connection-graph/README.md)。
- `sync-env/sync.ts [--root <directory>] [--filter <expression>] [--dry-run]`: `pnpm sync` の実体。`turbo run sync:local` で登録されたパッケージを同期する。`--filter` は繰り返し指定でき、`--check` はdry-runの別名。全件成功後のみ共有local設定のnullを消費し、部分同期では未同期パッケージに必要な削除指示を残す。

各パッケージの `sync:local` はapp-configの `sync-local` CLIを呼び、自分のネイティブ設定を更新する。単独実行では共有設定のnullを消費しない。Turboの同期・buildタスクはキャッシュを無効にし、`TARGETS` はbuildの環境変数に宣言する。

## GitHub Actionsとの境界

[再利用ワークフロー](../.github/workflows.DESG.md) がTurboによる差分・依存関係の選定と、テスト、build、deployを実行する。PRの権限・状態確認、排他、結果通知もワークフローが担当する。CLIはJSONを標準出力へ、警告・エラーを標準エラーへ返し、エラー時は終了コード1となる。

```sh
pnpm --filter @repo/scripts exec vitest run
pnpm --filter @repo/scripts exec tsc --noEmit
```

テストは設定収集、connection graph などの内部ロジックを検証する。検証対象は[テスト方針](../docs/policy/testing-policy.md)に従う。外部へのデプロイや通知は行わない。
