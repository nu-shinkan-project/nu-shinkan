# nu-shinkan

このリポジトリは，nu-shinkanプロジェクトのコードベースとして機能することを意図したモノレポであり，ビルド/モノレポ上のコマンド操作補助ツールとして，turborepoを利用しています．

## 開発を始める前に

本ワークスペースは，`devcontainer`で開いてください．

`docs`リポジトリが自動でクローンされるはずですが，クローンされなかった場合は
リポジトリルートで次を実行してください．

```sh
git clone https://github.com/nu-shinkan-project/docs.git docs
```

## 開発環境

このリポジトリでは，以下のツールを採用しています．

- パッケージマネージャ: **pnpm**
- ビルドツール: **turborepo**

また，近年パッケージマネージャを介してクレデンシャルが剽窃されるインシデントが多発しているため，基本的には**devcontainer**を利用して隔離環境下で開発をすすめます．

## 各種規則について

文書運用規則，Git運用規則（ブランチ戦略など），レビュー規約などは，[docsリポジトリ](https://github.com/nu-shinkan-project/docs)の[`policy/`](https://github.com/nu-shinkan-project/docs/tree/main/policy)に保管されています．

## 人間向けドキュメント

リポジトリの運用方法などについて説明した人間向けドキュメント（正しさや厳密さより，わかりやすさを優先したドキュメント）は，[docsリポジトリ](https://github.com/nu-shinkan-project/docs)の[`guidance/`](https://github.com/nu-shinkan-project/docs/tree/main/guidance)に保管されています．
