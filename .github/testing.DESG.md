# Action補助スクリプトのテスト

Action固有の入力検証・変換ロジックとそのテストは、対応する `actions/<action-name>/` に置く。検証対象の判断は[テスト方針](../docs/policy/testing-policy.md)に従う。WorkflowのYAML、実行指示、通知・集計の代替テストは追加しない。

`.github` は `@repo/github-actions` という非公開workspaceで、Vitestが `actions/` 配下の `*.test.ts` や `*.test.mjs` を再帰的に検出する。Actionごとのpackage.jsonや検出設定は不要。テストは同じディレクトリの内部モジュールを相対importし、CLIエントリーポイントはimport・起動しない。
