# テストの実行方法

リポジトリ指定のNode・pnpmと依存関係を準備したうえで、ルートから実行する。

```sh
pnpm --filter @repo/github-actions test --run
```

ルートの `pnpm test -- --run` でもTurboを通じて実行される。キャッシュを使わず確認する場合は `pnpm test --force -- --run` を使う。テストと補助スクリプトは同じworkspace内にあり、Turboの既定入力に含まれる。

依存関係だけを準備する場合は、ルートで `pnpm install --frozen-lockfile --filter @repo/github-actions` を実行する。このworkspaceの変更時は、開発者が上記のコマンドでローカルテストを実施する。専用CIによる自動実行は行わない。
