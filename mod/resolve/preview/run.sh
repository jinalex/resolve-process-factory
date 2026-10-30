#!/usr/bin/env bash
# Screenshots of the pane as a desktop would draw it, without the app: each scene in scenes.tsx is drawn by the mod's own
# hooks (claude plugin test), then rendered as HTML and shot with Playwright. Usage: mod/resolve/preview/run.sh [out] [dark|light] [pane width, default 480]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
mod="$(dirname "$here")"
out="$(cd "$(dirname "${1:-$mod/../../.preview}")" && pwd)/$(basename "${1:-.preview}")"
tmp="$(mktemp -d)"
trap 'rm -r -f "$tmp"' EXIT
cp -R "$mod/." "$tmp/"
rm -f "$tmp"/tests/*.test.tsx
cp "$here/scenes.tsx" "$tmp/tests/scenes.test.tsx"
claude plugin test "$tmp" > "$tmp/run.txt" 2>&1 || { grep -E "fail|Error" "$tmp/run.txt" >&2; exit 1; }
node "$here/render.mjs" "$out" "${2:-dark}" "${3:-480}" < "$tmp/run.txt"
echo "Pages and screenshots in $out"
