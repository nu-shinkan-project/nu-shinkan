# 共通チェックの実行

`tools/checking` はworkspaceの列挙、単体テスト・lint・UIテストの実行と結果収集を行う。ローカル実行とデプロイが同じ内部APIを利用する。GitHubへのアップロードやコメント投稿は呼び出し側が担当する。

Node.js 24以上とリポジトリ指定のpnpmを準備し、ルートで依存関係をインストールしてから実行する。

CI基盤の変更時は、開発者が関連する単体テスト・型チェック・lintをローカルで実施する。CI基盤専用のCIは設けていない。toolsの検証には次を使える。

```sh
pnpm --filter @repo/tools test --run
pnpm --filter @repo/tools exec tsc --noEmit
pnpm --filter @repo/tools exec eslint checking command.ts diagnostics.ts diagnostics.test.ts deploy
```

共通CLIは次のように実行する。

```sh
pnpm checking list
pnpm checking run
pnpm checking run --package @repo/tools --task test
pnpm checking run --package @repo/frontend-template --task ui_test
```

`--package` は正確なパッケージ名を指定する。省略時は全workspaceが対象となり、繰り返し指定できる。不明な名前はエラーになる。`--task` は `test`、`lint`、`ui_test` から選び、繰り返し指定できる。省略時はこの順序で全種類を実行する。`list` は名前・workspace相対パス・scriptsをJSONとして標準出力へ返す。

実行はTurboを通じてパッケージ間で逐次行い、失敗後も他のパッケージとチェックを続ける。未登録スクリプトは `no-script` として記録する。単体テストには `--run` を渡す。UIテストは対象パッケージの `ui_test:prepare` を先に逐次実行する。準備が失敗したパッケージのUIテストは実行エラーとし、他の対象は続行する。ブラウザとOS依存パッケージのインストール権限・ネットワークが必要となる場合がある。

実行後は `.artifacts/checking-result.json` に合格・不合格・実行エラー・スクリプトなしとキャッシュ利用の有無を保存する。チェックまたはUI準備・レポート収集が失敗した場合、終了コードは1になる。詳細は実行ログと結果ファイルを確認する。UIレポートは成功・失敗にかかわらず `.artifacts/ui_test-reports/<workspace相対パス>/` に収集する。UI実行前に過去の収集済みレポートと対象パッケージのHTMLレポートを削除し、キャッシュ再利用時はTurboが復元したレポートを収集する。

内部APIの `listPackages(root, names?, dependents?)` は、名前省略時に全件、空配列で空集合を返す。依存元への展開はTurboに委ねる。`checks(root, packages, tasks?)` は集約結果を返す。デプロイはapps/packagesに限定した影響集合を渡し、結果をデプロイレポートへ含める。ビルドも `checking/tasks.ts` のTurbo実行・結果判定を共用するが、デプロイ固有の順序・中断判断は `tools/deploy` が担当する。
