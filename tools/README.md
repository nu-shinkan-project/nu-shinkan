# リポジトリ用コマンド

Node.js 24 以上と pnpm、およびリポジトリの依存関係を準備し、リポジトリルートで実行する。

```sh
pnpm exec tsx tools/workspace/configs-cli.ts
pnpm exec tsx tools/workspace/configs-cli.ts @repo/organization-user-service
pnpm sync --dry-run
pnpm sync
```

設定一覧は JSON として標準出力へ返す。パッケージ名を指定すると、その設定だけを返す。不明なパッケージ名はエラーとなる。
`pnpm sync` は各パッケージのローカル設定を同期する。`--dry-run` は変更せず確認する。

接続グラフの操作は[接続グラフのマニュアル](connection-graph/README.md)、
内部の責務と設定収集の説明は [Workspace の構成](workspace.EXPL.md) を参照する。
