#!/usr/bin/env bash
# PostToolUse Edit|Write: lint the edited file. Never blocks.
f=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -f "$f" ] || exit 0
case "$f" in
  *.py) command -v ruff >/dev/null && ruff check --fix "$f" >&2 ;;
  *.yml|*.yaml) command -v yamllint >/dev/null && yamllint -d relaxed "$f" >&2 ;;
esac
exit 0
