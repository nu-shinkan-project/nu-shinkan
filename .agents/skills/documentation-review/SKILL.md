---
name: documentation-review
description: "文書の変更差分をレビューし、内容の妥当性と文書としての正確性・整合性・管理を該当段階で評価する。"
---

# 文書レビュー

確認済みの[文脈](../context-discovery/SKILL.md)を使い、[レビュー規約](../../../docs/policy/review.md)を読む。比較元・対象の版と依頼された範囲を確認し、Git差分に加えて変更を理解するための周辺の記述・参照元を読む。

Reviewabilityから始め、変更内容に該当する後続段階を規約の順序で評価する。先行段階の未解決事項に依存する範囲を保留し、既に明らかな問題は併せて示す。各段階の評価基準はレビュー規約を参照する。

[文書運用規則](../../../docs/policy/documentation.md)と[執筆要件](../../../docs/instructions/documentation/writing-documents.md)を根拠に確認する。文書自身が設計・判断・規則を表す場合はその内容をDesign段階で評価し、Documentation段階では文書の正確性・整合性・管理を評価する。metadata検査が必要なら[docs-audit](../docs-audit/SKILL.md)のコマンドを利用する。

適用した段階ごとに、パス・位置・根拠・影響と規約のラベルを付けて指摘する。評価不能な範囲はレビューの制約として分ける。質問や指摘を必ず作る必要はない。
