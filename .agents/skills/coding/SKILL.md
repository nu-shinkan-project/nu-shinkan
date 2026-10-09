---
name: coding
description: "既存コードを調査し、関連ポリシー・指示・設計・Snippetに沿って実装を変更し、必要なテストと検証を行う。"
---

# 実装の変更

AGENTS.mdと[文脈探索](../context-discovery/SKILL.md)で得た適用規則・設計を使う。[実装一貫性](../../../docs/instructions/implementation-consistency.md)と[テスト方針](../../../docs/policy/testing.md)を読む。

1. 変更対象の実装と呼び出し元を確認する。`docs/snippets/` と近い実装から関連するSnippet・標準実装を探し、本文とコードを読む。候補が多ければcontext-discoveryの収集コマンドを使える。
2. 要求と適用される設計に沿って実装する。CLIなら[作成方針](../../../docs/policy/make-cli.md)・[CLI設計](../../../docs/design/cli-tool-structure.md)を確認する。新しいアプリの生成は該当する新設スキル、deployment.yaml編集は[設定編集スキル](../edit-deployment-config/SKILL.md)を必要に応じて使う。
3. 変更の性質から検証価値のあるロジックと必要な型チェック・ビルドを選び、既存のpackage scriptsを利用する。全体の実行順は[オーケストレーション指示](../../../docs/instructions/tooling/monorepo-orchestration.md)、依存変更は[package-manager](../../../docs/instructions/tooling/package-manager.md)に従う。必要なテストを追加・更新し、選んだ検証を実行する。
4. 検証結果・保証範囲・未確認事項を報告する。安定性を評価するときは、テスト方針に従ってキャッシュの再利用と実行結果を区別し、結果・所要時間を記録する。文書や一時テストを作った場合は[文書運用規則](../../../docs/policy/documentation.md)と[一時テストの扱い](../../../docs/instructions/testing/volatile-test.md)を確認して整理する。
