#!/usr/bin/env bash
set -euo pipefail

# ------------------ #
# 更新               #
# ------------------ #

git fetch --quiet

# ------------------ #
# 検出               #
# ------------------ #

# upstream が消滅しているローカルブランチを収集する。
#
# 出力形式:
#   <local branch><TAB><upstream tracking state>
#
# 例:
#   main<TAB>
#   feature/foo<TAB>[gone]
#   feature/bar<TAB>[ahead 2]
#
# upstream が設定されていないブランチでは第2列は空になる。
#
# タブをフィールド区切りとして扱い、
# 第2列が厳密に "[gone]" のブランチだけを取り出す。
mapfile -t gone_branches < <(
  git for-each-ref \
    --format='%(refname:short)%09%(upstream:track)' \
    refs/heads |
  awk -F '\t' '$2 == "[gone]" { print $1 }'
)

# 対象がなければ終了する。
if ((${#gone_branches[@]} == 0)); then
  exit 0
fi

# ------------------ #
# 通知               #
# ------------------ #

# 色定義
YELLOW='\033[33m'
RED='\033[31m'
BOLD='\033[1m'
RESET='\033[0m'

# 現在のブランチ
current_branch="$(git branch --show-current)"

# 通知メッセージの構成
printf '\n%b⚠ Remote branch has been deleted for the following local branches:%b\n\n' \
  "${BOLD}${YELLOW}" \
  "${RESET}"

current_is_gone=false

for branch in "${gone_branches[@]}"; do
  if [[ "$branch" == "$current_branch" ]]; then
    current_is_gone=true

    printf '  - %b%s  <-- current branch%b\n' \
      "${BOLD}${RED}" \
      "$branch" \
      "${RESET}"
  else
    printf '  - %s\n' "$branch"
  fi
done

printf '\n%bSuggested cleanup:%b\n\n' "${BOLD}" "${RESET}"
if [[ "$current_is_gone" == true ]]; then
  printf '  git switch main\n'
fi
printf '  git branch -d'
printf ' %q' "${gone_branches[@]}"
printf '\n\n'

# ----------------
# 一時ファイルの除去
# ----------------

rm -f /tmp/auto-sync.log
