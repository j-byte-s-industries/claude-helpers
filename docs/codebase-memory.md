# codebase-memory-mcp: a code knowledge graph

[codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) indexes a repository into a persistent knowledge graph (functions, classes, call chains, HTTP routes) and exposes it as an MCP server. Claude can ask "who calls this?" or "what is the architecture?" in a few hundred tokens instead of grepping and reading dozens of files. It runs locally as a single binary; no API key or hosted service is involved.

Tested here with `codebase-memory-mcp 0.10.8`.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash
```

(Windows: the project provides `install.ps1`; see its README.) The installer puts the binary in `~/.local/bin` and configures the coding agents it finds. Options: `--skip-config` (binary only), `--dir=<path>`. If you would rather read the script first, download it and inspect it before running.

Check it:

```bash
codebase-memory-mcp --version
codebase-memory-mcp --help
```

Restart Claude Code and ask it to index the project (`index_repository`). Watched projects refresh in the background.

## What this repo adds on top

The installer generates its own skill, agents and hooks. This repo keeps snapshots of the ones we use so a team has the same behavior:

| File | What it does |
| --- | --- |
| `skills/codebase-memory/SKILL.md` | Teaches Claude when to use graph tools (`search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`) instead of grep. |
| `agents/codebase-memory-scout.md` | Fast, provisional lookups. |
| `agents/codebase-memory.md` | Default, task-directed verification. |
| `agents/codebase-memory-auditor.md` | Bounded-scope audits. |
| `hooks/cbm-session-reminder` | SessionStart (startup, resume, clear, compact): adds graph context. |
| `hooks/cbm-subagent-reminder` | SubagentStart: same, for subagents. |
| `hooks/cbm-code-discovery-gate` | PreToolUse for Grep/Glob and PostToolUse for Read: adds graph context. It never blocks a call. |

The three hooks call `codebase-memory-mcp hook-augment` and fail open: if the binary is missing they do nothing. The binary path defaults to `~/.local/bin/codebase-memory-mcp`; set `CBM_BIN` to use another location.

If you ran the project's own installer you may already have these files. `install.sh` here skips anything that already exists unless you pass `--force`.

## Tips

- Check index coverage (`check_index_coverage`) before trusting a "not found" answer; coverage is best-effort.
- Use grep or file reads for literals, config and non-code files.
- Optional graph visualization UI: `codebase-memory-mcp --ui=true` (the project serves it on `localhost:9749`).
