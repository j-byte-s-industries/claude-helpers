#!/usr/bin/env bash
# Copies this repo's skills, agents and hooks into ~/.claude.
#
#   ./install.sh             install what is missing, skip what already exists
#   ./install.sh --dry-run   show what would be copied, change nothing
#   ./install.sh --force     replace what exists (the old copy is kept as *.bak.<time>)
#
# It never edits settings.json or CLAUDE.md: those are personal. See README.md for
# the snippets to merge by hand.
set -euo pipefail

DRY=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${CLAUDE_HOME:-$HOME/.claude}"
STAMP="$(date +%Y%m%d-%H%M%S)"
copied=0
skipped=0

place() { # place <source> <destination>
  local src="$1" dst="$2"
  if [ -e "$dst" ]; then
    if [ "$FORCE" -eq 0 ]; then
      echo "skip    $dst (exists; use --force to replace)"
      skipped=$((skipped + 1))
      return
    fi
    echo "replace $dst (old copy: $dst.bak.$STAMP)"
    [ "$DRY" -eq 1 ] || mv "$dst" "$dst.bak.$STAMP"
  else
    echo "copy    $dst"
  fi
  if [ "$DRY" -eq 0 ]; then
    mkdir -p "$(dirname "$dst")"
    cp -R "$src" "$dst"
  fi
  copied=$((copied + 1))
}

for d in "$HERE"/skills/*/; do place "${d%/}" "$DEST/skills/$(basename "$d")"; done
for f in "$HERE"/agents/*.md; do place "$f" "$DEST/agents/$(basename "$f")"; done
for f in "$HERE"/hooks/*; do
  place "$f" "$DEST/hooks/$(basename "$f")"
  [ "$DRY" -eq 1 ] || chmod +x "$DEST/hooks/$(basename "$f")" 2>/dev/null || true
done

echo
echo "$copied copied, $skipped skipped$([ "$DRY" -eq 1 ] && echo ' (dry run)')"
command -v jq >/dev/null || echo "warning: jq is not installed; the big-read-guard and lint-after-edit hooks need it"
echo "Next: merge config/settings.example.json and config/CLAUDE.example.md into your own settings (see README.md)."
