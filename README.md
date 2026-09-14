# nu-shinkan

このリポジトリは，nu-shinkanプロジェクトのコードベストして機能することを意図したものレポであり，ビルド補助ツール・テンプレートとして，turborepoを利用しています．

## ディレクトリ構成

このリポジトリのディレクトリ構成に関する説明は，[ディレクトリ構成](docs/design/repository-layout.md)を参照してください．

## 開発環境

このリポジトリでは，以下のツールを採用しています．

- パッケージマネージャ: **pnpm**
- ビルドツール: **turborepo**

また，近年パッケージマネージャを介してクレデンシャルが剽窃されるインシデントが多発しているため，基本的には**devcontainer**を利用して隔離環境下で開発をすすめます．

## デプロイ

クレデンシャルの窃盗リスクを抑えるため，デプロイはローカルでは行わず，github runnners (actions)上で行うことを基本とします．
CI/CDの設定により，開発者はpushによってデプロイをトリガーすることが可能です．

## 文書の参照

[文書運用規則](https://github.com/nu-shinkan-project/docs/policy/documentation.md)に従い、設計・規約・指示書などの
グローバル文書は `docs/`、ローカル文書は対象のディレクトリに配置します。
Wiki は別の Git リポジトリです。未取得の場合はリポジトリルートで次を実行してください。

```sh
git clone https://github.com/nu-shinkan-project/docs.git docs
```

文書の入口は [Wiki Home](https://github.com/nu-shinkan-project/docs/Home.md)、エージェント向けの参照手順は
[AGENTS.md](AGENTS.md) にあります。Wiki の変更は Wiki 側で個別に差分確認・コミットします。
