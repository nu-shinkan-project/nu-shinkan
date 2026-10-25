# リポジトリ全体の処理

`packages/app-config` は単一パッケージの設定を読み取り、変換・生成する。`tools/` はリポジトリの構造を知っている開発補助コードを配置し、workspace全体の設定収集、接続グラフ、設定同期、アプリケーションの雛形作成を担当する。`tools/deploy/` はデプロイ方針に基づく設定生成、進行管理と結果集約を担当する。Node.js 24以上とpnpmを準備し、リポジトリルートで依存をインストールしてから実行する。app-configの利用には公開APIを使う。

## Workspace設定

`workspace/root.ts` はカレントディレクトリから親を辿ってpnpm workspaceルートを探す。`workspace/packages.ts` の `listPackages(root)` はTurboのworkspace一覧を基準とし、除外済みの集合をTurboの順序で取得する。ルートは含まず、重複名や範囲外パスを拒否する。`getWorkspaceConfigurations(root, packages)` は取得済み一覧から、パッケージ名、絶対パス `path`、ルート相対パス `pathRel`、deployment設定と存在するWrangler・dotenv設定を返す。重複パッケージ名はエラーになる。

```sh
pnpm exec tsx tools/workspace/configs-cli.ts [--root <directory>]
pnpm exec tsx tools/workspace/configs-cli.ts @repo/organization-user-service
```

通常のCLI出力は設定一覧で、Wranglerの内容をJSON化する。dotenvはapp-configと同じく `VITE_` 接頭辞の値だけを扱い、接頭辞を外す。設定値を含むため、一覧全体をActionsのログへ出す必要はない。

名前を省略すると全件、指定するとその集合をworkspace順で返す。内部の `selectPackages(packages, names?)` は空配列を空集合として扱う。不明な名前はエラーとなる。Worker名の検証と重複検出は接続解決に必要な `workerMapping()` で行う。

## 接続と設定同期

Workspaceの接続処理は `workspace/connections/` にまとめる。`resolve.ts` はBinding解決と同期予測、`graph.ts` は取得済みデータからのグラフ構築・探索、`read.ts` は設定取得と接続情報の読み取りを担当する。内部構成は[接続処理の説明](workspace/connections/connections.EXPL.md)を参照する。

- `workspace/connections/build.ts` / `select.ts`: [接続グラフの構築とreview対象選定](workspace/connections/README.md)。
- `sync-env/sync.ts [--root <directory>] [--filter <expression>] [--dry-run]`: `pnpm sync` の実体。`turbo run sync:local` で登録されたパッケージを同期する。`--filter` は繰り返し指定でき、`--check` はdry-runの別名。`deployment.yaml`のBinding宣言からWorker基底名を解決し、通常設定とstaging/releaseの既存Bindingを同期する。未宣言Binding・コメント・他属性は保持し、Bindingの自動追加は行わない。参照先は同期対象外も含む一覧から解決する。全処理成功後のみ共有local設定のnullを消費し、部分同期では未同期パッケージに必要な削除指示を残す。

各パッケージの `sync:local` はapp-configの `sync-local` CLIを呼び、自分のネイティブ設定を更新する。単独実行では共有設定のnullを消費しない。Turboの同期・buildタスクはキャッシュを無効にしている。

## デプロイ処理とGitHub Actionsとの境界

`deploy/update.ts`、`full.ts`、`review.ts`、`manual-pick.ts` は引数を内部処理へ渡す薄いCLI。`run.ts` が入力を検証し、対象commitとcheckoutの一致を確認して `orchestrate.ts` を呼ぶ。開始時と最終のmode、影響集合とターゲット集合、各フェーズの結果を保持し、想定する失敗でもレポートを生成してから終了する。

計画成功時に取得済みパッケージを `ExecutionContext` として後続処理へ渡す。レポートには計画・結果だけを渡し、設定編集用モデルは含めない。`sync-env/repository.ts` の `syncRepository()` はCLIとは独立して同期を実行する。

`plan.ts` は `workspace/packages.ts` の共通APIで取得したworkspaceからapps/packagesを選び、起点と共通APIによる依存元への展開から影響集合を作る。reviewでは接続グラフのreview入口からの経路をターゲットにする。manual-pickも同じ選定規則を使う。同期を予測した接続構成（Binding名・URL変数名、接続先パッケージ、Worker基底名、channel/profile）を計画へ保存する。レビュー用グラフはURLとBinding双方を使い、実行順序は実際のBinding辺だけを使う。対象外の参照先をデプロイ集合へ追加しない。Service Bindingの参照先を先にデプロイし、循環は強連結成分として警告する。

`configure.ts` はsync後の設定を読み直し、接続構成を計画と照合してから生成を取りまとめる。不一致は生成失敗として停止し、再計画はしない。環境変数全体の一致は要求しない。`worker-name.ts` がWorker名を組み立て、`deploy/connection-plan.ts` が共通の接続解決結果から接続先channelを決め、`deploy/connections.ts` が計画に沿ってURL変数の値を生成する。Wranglerの読取・反映はapp-configの `readServiceConnections()` と `serviceConnectionPatch()` が担当する。単一パッケージの組み立ては `assemble.ts` に渡し、共有設定は生成全体で一度取得する。previewでは対象内を同じPRのWorkerへ向け、対象外では既存URLを維持し、URLがなければstagingのWorker名から補う。接続先の解決には対象外パッケージのWorker基底名も使う。

Wranglerモデルを派生させてprofileを適用した後、使用するD1/R2設定の構造を検証する。全ターゲットの検証を終えてからCloudflareのD1一覧を一括取得し、実名に一致するIDを共有する。D1/R2の実名はprofileのsuffixを付けて決定し、公開型の配列を加工してモデルの `update()` で反映する。previewでもstagingのD1/R2を使用する。IDが未検出・複数一致、またはAPIが失敗した場合は生成を失敗として返し、元設定のIDにはフォールバックしない。KVの名前による自動bindは未対応で、明示IDを保持する。

生成先の `.env.production` と `wrangler.deploy.jsonc` は `configure.ts` が選び、保存自体は派生モデルの `save()` が行う。生成先の既存内容は置き換え、元の `.env.development` と `wrangler.jsonc` は保存しない。ネイティブファイルが存在しない形式は生成しない。選択済みD1/R2の `null` は配列として不正なため、API問い合わせ前に失敗する。複数ファイルの保存は原子的ではなく、後段の失敗時に保存済みファイルを巻き戻す保証はない。

検証済みの要求はchannelで判別する型とし、purpose/profile、previewのPR番号とselection sourceの組み合わせを表す。Turboの実行・summary解釈は `turbo/tasks.ts` が担当する。checkingはtest用引数・環境変数とチェック対象を決め、deployは依存buildを含めた結果を採用する。Turbo全体の失敗は要求対象の成功で上書きしない。通知用の行の値は `reportRows()` で組み立て、Markdownへの整形を分ける。

影響パッケージのtest/lint/ui_testは `checking/checks.ts` を利用して実行する。UI環境の準備・結果収集も共通処理が行い、失敗しても残りのチェックを実行する。すべて成功した後で `deploy/tasks.ts` が通常buildとWranglerによる順序付きデプロイを行う。個別デプロイの失敗後も残りを続け、全体の成功・部分失敗・失敗を返す。ビルドと設定生成は別のフェーズであり、パッケージ側のbuildはchannelを参照しない。

`deploy/cleanup.ts` はPR番号を受け取り、`cleanup-operations.ts` で実在Workerの列挙、厳密なsuffixによる選別、逐次削除と結果集約を行う。現在のソースは削除対象の根拠にしない。

GitHub固有のイベント・権限・依存のインストール・キャッシュ操作・排他・通知先は[Workflow](../.github/workflows.EXPL.md)が扱う。デプロイ内部処理はGitHub APIやGitHub固有の環境変数を参照しない。`.artifacts/deploy-report.md` は通知先に依存しないMarkdownであり、掲載はGitHub側が行う。

```sh
pnpm --filter @repo/tools test --run
pnpm --filter @repo/tools exec tsc --noEmit
```

テストは設定収集、対象選定、変換、継続・中断、結果集約などの内部ロジックを検証する。検証対象は[テスト方針](../docs/policy/testing.md)に従う。外部へのデプロイや通知は行わない。

## 設定モデルの利用

app-configは設定の読み取り、編集、合成、派生、保存を担当する。channel、PR番号、ターゲット集合、Worker・リソースの実名、Cloudflare API、デプロイ用生成先の決定は `tools/deploy/` が担当する。モデルはpackage exports経由で利用する。

| 公開口                      | モデルと操作                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@repo/app-config/wrangler` | `WranglerJsonc` が元のJSONCを編集・保存し、`synchronizeServices(connections)` で通常設定と既存profileの接続先だけを更新する。`derive(path)` で独立した `WranglerJson` を返す。`WranglerJson` は `flattenEnv(profile)`、`update()`、`useWorkersDev()`、`save(dryRun?)` を提供する。`WranglerConfig`、`WranglerPatch`、`D1Database`、`R2Bucket` もここから利用する。 |
| `@repo/app-config/dotenv`   | `Dotenv.derive(path)` は現在のVITE変数から同じ `Dotenv` 型を生成する。元文書のコメントや非VITE行は派生先に複製しない。`updateVariables()` と `save(dryRun?)` は元モデル・派生モデルの両方で使える。                                                                                                                                                                |
| `@repo/app-config/settings` | `DeploymentSettings(packagePath, profile)` または `DeploymentSettings(deployment, profile, shared)` が `deployment` と `overrides` を提供する。共有設定よりパッケージの設定を優先する。                                                                                                                                                                            |

`derive(path)` は現在の編集済みメモリ状態から派生し、ディスクには書き込まない。相対パスは元ファイルのディレクトリを基準にする。`save(true)` は保存せず、保存先と内容を表示する。`WranglerJsonc` と `WranglerJson` の `update()` は、変数のキー更新・nullによる削除、Service Bindingの更新・追加、その他の設定の置換について同じ意味を持つ。Wranglerの `data` は独立したスナップショットであり、取得値の変更はモデルに反映されない。D1/R2の構造検証は `WranglerJson` のprofile選択後の `data` 取得時に行い、使用しないprofileは検証しない。

## コマンドの診断表示

`command()` はstdout/stderrを解析用にそのまま保持し、通常実行では診断表示だけをstderrへ逐次出力する。UTF-8の途中で分割された文字はデコーダーで結合する。既知の秘密値の長さに応じた末尾、未完了行、引用値、改行を跨ぐ認証情報、未完了の制御シーケンスを保留し、マスキングしてから表示する。改行のない出力や未完了の引用は終了時まで遅れる場合がある。quiet成功時は診断を表示せず、失敗時だけ保持済みの出力をマスクして表示する。
