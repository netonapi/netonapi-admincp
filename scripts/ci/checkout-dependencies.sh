#!/usr/bin/env bash
# 按 dependencies.lock 把兄弟仓库检出到工作区（CI 用）。每个仓库精确到提交号，构建可复现。
# 私有仓库通过 NETON_CI_TOKEN 访问。用法：checkout-dependencies.sh <工作区根目录>
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
workspace="${1:?usage: checkout-dependencies.sh <workspace-root>}"
token="${NETON_CI_TOKEN:-}"
while read -r repo path sha; do
  [[ -z "${repo:-}" || "$repo" == \#* ]] && continue
  url="https://github.com/$repo.git"
  [ -n "$token" ] && url="https://x-access-token:${token}@github.com/$repo.git"
  dest="$workspace/$path"
  mkdir -p "$dest"
  git -C "$dest" init -q
  git -C "$dest" fetch -q --depth 1 "$url" "$sha"
  git -C "$dest" checkout -q FETCH_HEAD
  echo "checked out $repo@${sha:0:12} -> $path"
done < "$here/dependencies.lock"
