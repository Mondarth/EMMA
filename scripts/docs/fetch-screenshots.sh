#!/usr/bin/env bash
# Fetch the browser extension's store screenshots, which the guide shows, from the newest extension release that has
# them (see .github/workflows/store-screenshots.yml), into docs/_static/screenshots/ (ignored by git).
#
#   scripts/docs/fetch-screenshots.sh
#
# Needs the GitHub CLI, signed in (`gh auth login`), or GH_TOKEN. Without a release that has them, it says so and leaves
# the guide to be built without its pictures.
set -euo pipefail

cd "$(dirname "$0")/../.."
repo="${GITHUB_REPOSITORY:-Mondarth/EMMA}"
target=docs/_static/screenshots

rm -rf "$target"
mkdir -p "$target"
for tag in $(gh release list --repo "$repo" --limit 50 --json tagName --jq '.[].tagName | select(startswith("extension-v"))'); do
  if gh release download "$tag" --repo "$repo" --pattern 'screenshot-*.png' --dir "$target" 2>/dev/null; then
    echo "fetch-screenshots: the screenshots of ${tag}"
    exit 0
  fi
done
echo "fetch-screenshots: no extension release has screenshots yet; the guide is built without them" >&2
