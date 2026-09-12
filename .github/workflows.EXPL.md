# GitHub Actionsの構成

イベントを受け付けるworkflowから、用途別の再利用workflowを呼ぶ。デプロイは固定したSHAをcheckoutし、そのコミットの設定・スクリプトを使う。

| 受付                | 再利用workflow             | 処理                                                      |
| ------------------- | -------------------------- | --------------------------------------------------------- |
| `on-tag-change.yml` | `update.full-deploy.yml`   | staging/releaseの初回タグ作成、手動full                   |
| `on-tag-change.yml` | `update.update-deploy.yml` | タグ更新の差分と依存関係による影響先。比較不能ならfull    |
| `on-pr.yml`         | `review.review-deploy.yml` | main向けPRの差分、依存関係、connection graphによるpreview |
| `on-pr-comment.yml` | `review.pick-deploy.yml`   | `/preview <package-name> ...` の指定と影響先からpreview   |
| `on-pr-close.yml`   | `review.clean-preview.yml` | PR close、またはPR番号を指定した手動cleanup               |

コメント受付はrepositoryへのwrite権限と、同じrepositoryのopen PRであることを確認し、head/base SHAを固定する。pickはそのhead上で指定名をTurboの一覧と照合する。フィルタ式や空指定は受け付けない。通常のpreviewもfork PRでは実行しない。

## 選定と実行

fullは全件、diffは直接変更されたパッケージ、pickは指定パッケージをテスト対象にする。デプロイ対象は依存関係による影響先まで含め、review/pickではさらにconnection graphでreview入口からの利用経路を選ぶ。

`filter-util` は指定タスクを持つパッケージだけに絞り、`packages`、依存を含むインストール引数 `deps_args`、正確な実行引数 `affected_args`、`has_hit` を出力する。名前に反して `affected_args` は影響先を再展開しない。空文字は全件、JSONの `[]` は空対象であり、空対象を全件へ展開しない。

`workspace/configs-cli.ts --targets` が選定対象へpathとWorker基底名を付与する。その結果を `TARGETS` に保持し、設定同期・build・deployへ渡す。テストactionは各対象の依存を準備するため、同じ作業領域でのインストール競合を避けて順番に実行する。UIテストはPlaywrightブラウザを導入して実行し、HTMLレポートをartifactへ保存する。

準備に失敗した場合はdeployしない。デプロイ対象が空でもテスト対象があればテストする。空対象は通常は成功扱いだが、pickではデプロイ可能な対象がなければ失敗とする。各deployをTurbo経由で実行し、一部が失敗しても残りの対象を試行し、最終結果を失敗にする。

## 排他とPR状態

full/updateは `deploy-channel-<channel>` でFIFOの待機列を共有する。updateの比較不能時はfullへ処理を渡し、同じロックを二重取得しない。review/pick/cleanupは `preview-pr-<number>` を共有し、実行中をキャンセルせず待機中の最新一件を保持する。

previewは実行開始時とdeploy直前にPR状態を確認する。head/baseが変わった要求はskipし、閉じたPRはcleanupへ進む。close受付後にreopenされたPRのcleanupはskipする。手動cleanupはopen PRも明示的に削除できる。

cleanupは既定ブランチをcheckoutし、各パッケージの `undeploy:preview` をTurboで実行する。PR番号を正の整数として検証し、自身のPR Workerだけをforce削除する。WranglerのWorker／legacy environment不存在は成功扱いとし、一時的な失敗は最大3回試行する。削除・改名されて既定ブランチに存在しない過去のパッケージは、この方式では回収できない。

## 結果と準備

各workflowの最後に、成否、失敗ステップ、パッケージごとのdeploy結果、取得できたWorker URL、Actions runへのリンクをSummaryへ出力する。previewはPRへも通知する。通知失敗は警告として記録する。詳細ログはActionsで確認する。

GitHub Environmentsの `preview`、`staging`、`release` に `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を設定する。retag・merge用のutility workflowは既存のGitHub App資格情報を使用する。

`on-pr.yml` のtooling jobでscriptsのテストと型検査を実行する。`nightly.yml` は毎日UTC 00:00に既定ブランチの型検査・全workspaceの単体テスト・UIテストを実行する。ローカルでは外部APIをmockしてPR状態・権限・部分失敗を検証する。GitHub上の排他、Environment権限、Cloudflareへのdeployとcleanupは実環境での確認が必要になる。

## スクリプト記述と Action 切り出し標準

GitHub Actions 内のスクリプト実装および切り出しについては、[ADR: GitHub Actions スクリプト実装ガイドライン](../nu-shinkan.wiki/ADR/26-09-09-workflow-script-guidelines.md) に基いて構成する。

1. **GitHub API / PR・Issue コメント / Output 設定**: `actions/github-script@v9` を使用する。
2. **Git / ローカルロジック処理**: インラインヒアドキュメント (`<<'JS'`) を避け、対応する GitHub Action 直下に切り出した `.mjs` 補助スクリプトを実行する。
3. **補助スクリプトの Action 帰属**: 補助スクリプト (`.mjs`) を導入する際は必ず自然な単位での Action 切り出し (`.github/actions/<action-name>/`) を伴う。


## `/merge-ff` の認可

PRへの `/merge-ff` コメントを受け付け、`authorize-pr-command` に `command: /merge-ff` を渡し、コメント本文と投稿者を検証する。接頭辞が一致するだけの別コマンドや追加引数は拒否する。投稿者はイベントの `comment.user.login` から取得し、再実行者やPR作成者の権限では代替しない。

`authorize-pr-command` は、入力された引数なしのコマンドがPRに投稿されたことと投稿者の実効Write権限を検証し、`pr_number` と `actor` を出力する。コマンドごとの処理可否やPRのマージ状態は扱わない。`/preview` の引数解析・再実行者検証は別の契約のため、既存の受付処理を維持する。

`check-pr-mergeable` は `pr-number` を受け取り、GitHubの通常マージ可否を検証して `head_sha` と `base_ref` を出力する。投稿者の認可は行わないため、`/merge-ff` では投稿者認可の後に呼び出す。

Appトークンを作成する前に、通常の `GITHUB_TOKEN` で次を順番に確認する。

- REST `GET /repos/{owner}/{repo}/collaborators/{username}/permission` の実効権限が Write・Maintain・Admin 相当であること。APIの `permission` はチーム・組織等からの権限を含み、Maintainや独自ロールも基底権限へ解決する。ロール名の文字列やbypass権限から許可を推測しない。
- GraphQL `PullRequest` の同じ応答から `state`、`isDraft`、`isMergeQueueEnabled`、`mergeStateStatus`、`headRefOid`、`baseRefName` を取得する。openかつ非draftで、merge queueが無効、`mergeStateStatus` が `CLEAN`・`HAS_HOOKS`・`UNSTABLE` の場合だけ許可する。これらはGitHubがmergeableと定義する状態であり、任意の失敗チェックを独自に必須化しない。queueへの投入可能状態は直接マージの許可ではないため、queueが有効なブランチは拒否する。

承認数、CODEOWNERS、会話解決、必須チェック、最新baseへの追従条件はGitHubの集約結果に委ねる。設定変更が `BLOCKED` 等の結果として反映されれば、workflowの変更なしに拒否される。AdminやAppのbypass能力による例外はなく、API失敗、欠落、不明な状態でもApp認証とpushへ進まない。

認可成功後に既存のApp認証を使用し、対象baseブランチを履歴付きでcheckoutする。検証済みの `headRefOid` を出力から `HEAD_SHA` へ渡し、そのSHAをfetchして `git merge --ff-only "$HEAD_SHA"`、`git push origin "HEAD:refs/heads/${BASE_REF}"` を実行する。PRの最新headを再解決せず、merge commit・rebase・force push・lease・自動復旧は使用しない。非fast-forwardはmerge失敗、互換性のないリモート更新との競合は通常のpush失敗になる。

認可とpushは原子的ではない。照会後に権限・レビュー・ルール・PR状態が変化した場合を、この方式で完全には防げない。GitHub APIの計算遅延もあり得る。不明な状態では失敗させ、再試行する場合もコマンド投稿者の現在の権限とPR状態を再照会する。App権限によっては適格なPRでもpushが拒否されるが、成功させるためのbypass経路は追加しない。

API契約: [実効権限](https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user)、[PRの集約状態とhead SHA](https://docs.github.com/en/graphql/reference/pulls)、[GitHub CLIの通常マージ・queue判定](https://github.com/cli/cli/blob/trunk/pkg/cmd/pr/merge/merge.go)。
