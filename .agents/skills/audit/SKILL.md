---
name: audit
description: "指定されたコード・設定・文書の現状を要求・規約・設計と照合して監査し、適合・不整合・未評価を報告する。"
---

# 現状の監査

確認済みの[文脈](../context-discovery/SKILL.md)を使い、依頼された対象・範囲・観点を定める。適用される規約・設計を根拠として現在の実装・設定を調べ、名称やmetadataだけで適合を判断しない。

文書の現状監査は[docs-audit](../docs-audit/SKILL.md)を利用する。ADR固有の判断・置換関係の監査が必要なら [adr-audit](../../../docs/.agents/skills/adr-audit/SKILL.md)を利用する。

観点ごとの適合、不整合、評価できなかった範囲を、対象パスと根拠とともに報告する。既存テストやコマンドを証拠として使う場合は[テスト方針](../../../docs/policy/testing.md)に従い、その保証範囲を明示する。
