---
name: edit-deployment-config
description: "deployment.yamlの環境差分・パッケージ接続・reviewEntryを、既存設定設計とローダーに沿って編集し、previewへの影響を確認する。"
---

# deployment.yamlの編集

確認済みの[文脈](../context-discovery/SKILL.md)を使い、[設定設計](../../../docs/design/configuration-design.md)・[デプロイ設計](../../../docs/design/deploy-design.md)・[設定の使い方](../../../docs/explanation/repo/deployment.yamlについて.md)を読む。

1. 対象のdeployment.yaml、ネイティブ設定、`packages/app-config/globalRuntimeEnvs.yaml` と参照先パッケージを確認する。local向けの設定はネイティブファイル、staging/releaseの差分はenvs、接続はconnections、確認入口はreviewEntryとして整理する。優先順位・省略時の扱いは設計を参照する。
2. 必要な設定を編集し、接続先のパッケージ名・binding名・URL用変数を照合する。Worker suffixやpreviewの接続生成を設定ファイル側で再実装しない。
3. [接続グラフCLI](../../../tools/connection-graph/README.md)や既存app-configローダーを使って影響を調べる。グラフ生成は不明な接続先・自己ループを除外するため、成功だけで接続先の実在を保証しない。workspace一覧と元設定も照合する。
4. 既存の検証を必要な範囲で実行し、環境差分・接続・preview確認経路への影響と未確認事項を報告する。設定編集の依頼から実デプロイへ自動的に広げない。
