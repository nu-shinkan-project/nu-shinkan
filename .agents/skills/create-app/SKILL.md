---
name: create-app
description: "apps配下にアプリを新設する。用途からfrontend／backendを選び、リポジトリの生成コマンドを使う。"
---

# アプリの新設

用途からfrontend／backendを判断し、メインリポジトリのルートで対応する生成コマンドを実行する。`<name>` は作成するアプリ名。

| 種類     | 用途                              | コマンド                    |
| -------- | --------------------------------- | --------------------------- |
| frontend | 画面・ブラウザ側の処理            | `pnpm make:frontend <name>` |
| backend  | API・Workerなどのサーバー側の処理 | `pnpm make:backend <name>`  |

初期化・接続設定は生成スクリプトに任せる。
