#!/usr/bin/env bash
set -euo pipefail

sudo apt update
sudo apt install ripgrep -y

# ---------------------------
# git configuration
# ---------------------------

# このリポジトリでは remote のタグを正とする。
# すでに同じ refspec があれば追加しないことで、postCreate の再実行時も重複登録を防ぐ。
if ! git config --get-all remote.origin.fetch | grep -Fxq '+refs/tags/*:refs/tags/*'; then
	# "+" 付き refspec により、同名タグが食い違っていても fetch で local を remote 側へ合わせる。
	git config --add remote.origin.fetch '+refs/tags/*:refs/tags/*'
fi

# remote で削除されたタグを local からも削除する設定を有効化する。
git config fetch.pruneTags true
# remote で削除されたブランチを local からも削除する設定を有効化する。
git config fetch.prune true

# ---------------------------
# dependencies setup
# ---------------------------

pnpm install --frozen-lockfile
pnpm prepare

# ---------------------------
# Wiki Repo Setup
# ---------------------------

if [[ ! -d "$target_dir" ]]; then
  git clone --depth 1 https://github.com/nu-shinkan-project/docs.git
fi