#!/usr/bin/env bash
# PreToolUse(Read): deny whole-file reads of big files; steer to haiku-scout or offset/limit.
in=$(cat)
f=$(jq -r '.tool_input.file_path // empty' <<<"$in")
off=$(jq -r '.tool_input.offset // empty' <<<"$in")
lim=$(jq -r '.tool_input.limit // empty' <<<"$in")
[ -z "$f" ] && exit 0
[ -n "$lim" ] || [ -n "$off" ] && exit 0
case "${f,,}" in *.png|*.jpg|*.jpeg|*.gif|*.webp|*.pdf|*.ipynb) exit 0 ;; esac
[ -f "$f" ] || exit 0
size=$(wc -c <"$f")
[ "$size" -lt 40000 ] && exit 0
jq -n --arg s "$size" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",
permissionDecisionReason:("File is " + $s + " bytes (>40KB). Use haiku-scout agent to extract what you need, or Read with offset/limit.")}}'
