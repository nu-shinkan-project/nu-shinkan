# リポジトリ全体の処理

`packages/app-config` は単一パッケージの設定を読み取り、変換・生成する。`tools/` はリポジトリの構造を知っている開発補助コードを配置し、workspace全体の設定収集、接続グラフ、設定同期、アプリケーションの雛形作成を担当する。`tools/deploy/` はデプロイの進行管理と結果集約を担当する。Node.js 24以上とpnpmを準備し、リポジトリルートで依存をインストールしてから実行する。app-configの利用には公開APIを使う。

## Workspace設定

`workspace/root.ts` はカレントディレクトリから親を辿ってpnpm workspaceルートを探す。`workspace/configs.ts` の `getWorkspaceConfigurations(root?)` は `pnpm-workspace.yaml` のパターンと除外指定に従い、パッケージ名、絶対パス `path`、ルート相対パス `pathRel`、存在するWrangler・dotenv設定を返す。重複パッケージ名はエラーになる。

```sh
pnpm exec tsx tools/workspace/configs-cli.ts [--root <directory>]
pnpm exec tsx tools/workspace/configs-cli.ts --targets @repo/dummy-preview-api
```

通常のCLI出力は設定一覧で、Wranglerの内容をJSON化する。dotenvはapp-configと同じく `VITE_` 接頭辞の値だけを扱い、接頭辞を外す。設定値を含むため、一覧全体をActionsのログへ出す必要はない。

`--targets` は後続の正確なパッケージ名を `{ package, path, workerName? }[]` に変換する。pathはworkspace相対、Worker名は基底名。名前の指定がなければ空配列となり、不明な名前・不正なWorker名はエラーになる。このCLIは設定一覧を操作するための補助ツールであり、デプロイ処理は内部関数から設定を取得する。

## 接続と設定同期

- `connection-graph/build.ts` / `select.ts`: [接続グラフの構築とreview対象選定](connection-graph/README.md)。
- `sync-env/sync.ts [--root <directory>] [--filter <expression>] [--dry-run]`: `pnpm sync` の実体。`turbo run sync:local` で登録されたパッケージを同期する。`--filter` は繰り返し指定でき、`--check` はdry-runの別名。全件成功後のみ共有local設定のnullを消費し、部分同期では未同期パッケージに必要な削除指示を残す。

各パッケージの `sync:local` はapp-configの `sync-local` CLIを呼び、自分のネイティブ設定を更新する。単独実行では共有設定のnullを消費しない。Turboの同期・buildタスクはキャッシュを無効にしている。

## デプロイ処理とGitHub Actionsとの境界

`deploy/update.ts`、`full.ts`、`review.ts`、`manual-pick.ts` は引数を内部処理へ渡す薄いCLI。`run.ts` が入力を検証し、対象commitとcheckoutの一致を確認して `orchestrate.ts` を呼ぶ。開始時と最終のmode、影響集合とターゲット集合、各フェーズの結果を保持し、想定する失敗でもレポートを生成してから終了する。

`plan.ts` は `checking/packages.ts` の共通APIで取得したworkspaceからapps/packagesを選び、起点と共通APIによる依存元への展開から影響集合を作る。reviewでは接続グラフのreview入口からの経路をターゲットにする。manual-pickも同じ選定規則を使う。Service Bindingの参照先を先にデプロイし、循環は強連結成分として警告する。

`configure.ts` はsync後の設定とCloudflareの既存D1一覧を収集し、app-configの単一パッケージ生成処理へ渡す。生成物は `.env.production` と `wrangler.deploy.jsonc`。app-configはworkspace列挙やAPI問い合わせを担当しない。KVの名前による自動bindは未対応で、明示IDを保持する。

影響パッケージのtest/lint/ui_testは `checking/checks.ts` を利用して実行する。UI環境の準備・結果収集も共通処理が行い、失敗しても残りのチェックを実行する。すべて成功した後で `deploy/tasks.ts` が通常buildとWranglerによる順序付きデプロイを行う。個別デプロイの失敗後も残りを続け、全体の成功・部分失敗・失敗を返す。ビルドと設定生成は別のフェーズであり、パッケージ側のbuildはchannelを参照しない。

`deploy/cleanup.ts` はPR番号を受け取り、`cleanup-operations.ts` で実在Workerの列挙、厳密なsuffixによる選別、逐次削除と結果集約を行う。現在のソースは削除対象の根拠にしない。

GitHub固有のイベント・権限・依存のインストール・キャッシュ操作・排他・通知先は[Workflow](../.github/workflows.EXPL.md)が扱う。デプロイ内部処理はGitHub APIやGitHub固有の環境変数を参照しない。`.artifacts/deploy-report.md` は通知先に依存しないMarkdownであり、掲載はGitHub側が行う。

```sh
pnpm --filter @repo/tools test --run
pnpm --filter @repo/tools exec tsc --noEmit
```

テストは設定収集、対象選定、変換、継続・中断、結果集約などの内部ロジックを検証する。検証対象は[テスト方針](../docs/policy/testing.md)に従う。外部へのデプロイや通知は行わない。
