---
name: documentation
description: "文書の役割・編集権限・適用規約を確認し、文書を作成・編集・整理する。執筆手順と仕上げ確認を提供する。"
---

# 文書の作成・編集

確認済みの[文脈](../context-discovery/SKILL.md)を使い、[文書運用規則](../../../docs/policy/documentation.md)・[執筆要件](../../../docs/instructions/documentation/writing-documents.md)・対象文書の[保護条件](../../../docs/instructions/documentation/document-protection.md)を読む。READMEなら[編集条件](../../../docs/instructions/documentation/readme-editing.md)も確認する。

1. 読者・用途・文書種別と編集権限を確認し、配置を決める。一時成果物は[handoff指示](../../../docs/instructions/documentation/temporary-document.md)に従う。ADR・Snippet・知見の新設時は `docs/templates/` の対応テンプレートを使う。ADR作成時の初期状態は文書運用規則に従う。
2. 関連する現状・設計・既存文書を読み、重複や矛盾を整理して執筆する。[執筆の作例と仕上げ確認](references/writing-procedures.md)を必要に応じて使う。
3. 変更後の本文・リンク・分類・metadataを確認する。metadataの機械検査が必要なら[docs-audit](../docs-audit/SKILL.md)を利用する。文書のみの変更では[テスト方針](../../../docs/policy/testing.md)に従って文書を検証する。
4. 変更内容と未決事項を報告する。日本語の推敲が必要なら既存yomiyasuを利用する。
