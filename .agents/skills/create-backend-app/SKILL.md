---
name: create-backend-app
description: "backendアプリを生成コマンドmake:backendでapps配下に新設し、名前・ポート・実行時設定・接続と必要な検証を確認する。"
---

# backendアプリの新設

確認済みの[文脈](../context-discovery/SKILL.md)を使い、[リポジトリ固有コマンド](../../../docs/explanation/repo/リポジトリ固有のコマンド.md)・[設定設計](../../../docs/design/configuration-design.md)を読む。

1. アプリ名・用途を把握し、既存appsと `tools/make-app/`・`templates/backend-template/` の現状を確認する。名称やポートの割当は生成コマンドに任せる。
2. メインルートで `pnpm make:backend <name>` を実行する。既存アプリの上書きや生成処理の複製をしない。失敗した場合は生成済みのファイルと依存変更を確認してから再実行する。
3. 開発ポート・inspectorポート、wrangler.jsoncのWorker名・bindings・vars、生成された型を確認する。生成コマンドはinstallとcf-typegenを実施するため、生成が成功した直後に同じ処理を無条件で繰り返さない。必要な接続・環境差分は[deployment設定編集](../edit-deployment-config/SKILL.md)で扱う。
4. アプリ固有の実装・検証は[coding](../coding/SKILL.md)を利用する。生成先、割り当てたポート、設定変更、実行した検証と未確認事項を報告する。新設の依頼だけでデプロイまで広げない。
