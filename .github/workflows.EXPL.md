# GitHub Actionsのデプロイ処理

デプロイ要求を受け付けるWorkflowと、固定commitを実行する `deploy.run.yml` で構成する。対象選定・設定生成・テスト・ビルド・デプロイ・Markdown生成は `tools/deploy/`、受付・権限確認・環境準備・排他・通知は `.github/` が担当する。[デプロイ設計](../docs/design/deploy-design.md) と [toolsの構成](../tools/workspace.EXPL.md) を参照する。

| 受付Workflow               | 契機                                                        | 起動するCLI      |
| -------------------------- | ----------------------------------------------------------- | ---------------- |
| `update.update-deploy.yml` | staging/releaseへのタグpush                                 | `update.ts`      |
| `update.full-deploy.yml`   | channelを選ぶworkflow_dispatch                              | `full.ts`        |
| `review.review-deploy.yml` | main向け同一リポジトリPRのopened/reopened/synchronize       | `review.ts`      |
| `review.pick-deploy.yml`   | write権限を持つ投稿者の `/preview <exact-package-name> ...` | `manual-pick.ts` |
| `review.clean-preview.yml` | PR closed、またはPR番号を指定したworkflow_dispatch          | `cleanup.ts`     |

## 受付と排他

updateはイベントに記録された対象SHAと比較元SHAを渡す。比較元の欠如や比較不能によるfullへの切替は計画処理が行う。fullは受付ジョブでchannelのタグをcommit SHAへ解決し、その後の待機・実行中にタグを読み直さない。fullの実行はタグを移動しない。新CLIを含まない過去commitのデプロイには対応しない。

reviewはイベントのPR HEADとBASEを使用する。manual-pickは受付時に投稿者・再実行者のwrite権限、PRがopenで同一リポジトリであることを確認し、HEADを固定する。パッケージ名の書式はGitHub側、apps/packages内の存在確認とreview経路の選定は計画処理が担当する。未知の名前もCLIのレポートへ含まれる。

共通Workflowの実行ジョブでconcurrencyを取得する。update/fullは `deploy-channel-<channel>` と `queue: max`、review/manual-pick/cleanupは `preview-pr-<number>` と `queue: single` を共有する。実行中の要求はキャンセルしない。厳密な受付順は保証しない。

デプロイ直前・cleanup直前のPR状態の再確認は行わない。cleanupの手動入力は受付時にPR番号と存在を検証する。closeによるcleanupもpreviewと同じキューで直列化する。

## 環境準備と実行

`use-repo` はNode 24とpnpmを準備し、全workspaceの依存関係をインストールしてapp-configをビルドする。通常のデプロイでは、登録された `ui_test:prepare` をTurboの逐次実行で準備してからCLIを起動する。cleanupではブラウザ準備を行わない。依存の準備はWorkflowの責務であり、CLIは準備済みの環境を前提とする。

CLIは `計画 → sync → 影響集合のtest/lint/ui_test → 設定生成 → build → 順序付きdeploy → レポート` を実行する。Workflow側で同じチェックを重複実行しない。UIレポートは `.artifacts/ui_test-reports/` からartifactへ保存する。各フェーズの対象、完了状態、失敗理由はCLIとWorkflowのログで確認する。

## キャッシュ

TurboキャッシュはPRまたはchannelの名前空間で復元し、run IDとrun attemptを含む新しいキーで保存する。チェックの一部が失敗しても成功したタスクのキャッシュを保存する。復元・保存は失敗しても処理の成否を変更しない。

PR pushのmerge refとissue_commentの既定ブランチでは、GitHubのキャッシュ参照範囲が異なる。この間の共有に回避策は導入せず、manual-pickではTurboキャッシュの保存・復元を行わない。PR pushでは同じPR refのキャッシュを利用する。cleanupはTurboキャッシュを使用しない。setup-nodeが管理するpnpmの依存ダウンロードキャッシュとは区別する。

## cleanupと通知

cleanupはCloudflare APIから実在するWorkerを列挙し、名前が `-preview-<PR番号>` で終わるものを逐次削除する。現在のソースから削除・改名されたWorkerも対象に含む。列挙に失敗した場合は削除を開始しない。個別削除の失敗後も継続し、成功・部分失敗・失敗を集約する。D1・R2などの共有リソースは削除しない。旧名Workerの移行用削除は行わない。

通知ステップは `always()` で動作し、CLIの `.artifacts/deploy-report.md` をpreviewではPRコメント、staging/releaseではJob Summaryへ掲載する。掲載の成否はCLIの成否とは別のステップ結果になる。レポートがなければ、ステップ結果とActions runへのリンクで通知する。checkoutに失敗してローカルActionが使えない場合も、リモートのgithub-scriptで最低限の通知を試みる。

update/fullが失敗・未実行になった場合は、Full Deployによる復旧を案内する。後続の差分デプロイ成功だけで全体が復旧したとは扱わない。

GitHub Environmentsのpreview/staging/releaseには `CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_API_TOKEN` を設定する。D1の名前解決にはD1 ReadまたはWrite、Workerの操作には対応するWorkers権限が必要となる。トークンや設定ファイルの内容はログへ出さない。

## 検証

内部ロジックのテストと型チェックはローカルで実行できる。Workflow YAMLや通知の代替テストは作らない。GitHub上の権限・排他・キャッシュ・通知、実際のデプロイと削除は、切替後のrunで確認する。nightlyは既定ブランチで全workspaceの単体テスト・UIテストとtoolsの型チェックを実行する。
