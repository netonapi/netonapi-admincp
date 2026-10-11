#!/usr/bin/env bash
# 用本机兄弟仓库「远端分支头」的提交号生成 dependencies.lock。
#
# 只认已推送的提交：本地未推送的提交 CI 拿不到，锁进去只会让 CI 检出失败。本地领先远端时给出警告，
# 提醒先推送依赖仓库再更新锁定。用法：在 neton-application-front 仓库里执行 scripts/ci/update-dependency-lock.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
workspace="$(cd "$here/../../../.." && pwd)"   # projects/ （与 Neton/、privchat/ 同级）
out="$here/dependencies.lock"
tmp="$(mktemp)"
echo "# 由 scripts/ci/update-dependency-lock.sh 生成，勿手改。格式：<仓库> <路径> <提交号>" > "$tmp"
warn=0
while read -r repo path; do
  [[ -z "${repo:-}" || "$repo" == \#* ]] && continue
  dir="$workspace/$path"
  [ -d "$dir/.git" ] || { echo "missing checkout: $dir" >&2; exit 1; }
  branch="$(git -C "$dir" rev-parse --abbrev-ref HEAD)"
  git -C "$dir" fetch -q origin "$branch"
  sha="$(git -C "$dir" rev-parse "origin/$branch")"
  ahead="$(git -C "$dir" rev-list --count "origin/$branch..HEAD")"
  if [ "$ahead" != "0" ]; then echo "warning: $path is $ahead commit(s) ahead of origin/$branch; CI will build origin/$branch" >&2; warn=1; fi
  printf '%-52s %-52s %s\n' "$repo" "$path" "$sha" >> "$tmp"
done < "$here/dependencies.lock.template"
mv "$tmp" "$out"
echo "wrote $out"
exit 0
