# Tiered delegation: cheap models do the grunt work

The idea: match model cost to the kind of decision being made.

| Tier | Who | Owns |
| --- | --- | --- |
| Main session (Opus) | you and the session | requirements, design, task breakdown, acceptance commands, review, merge decisions |
| Sonnet | `sonnet-builder-low`, `sonnet-builder-medium` | one broad task in one git worktree: split into units, write the prompts, integrate and validate, run the verify command, commit |
| Haiku | `haiku-coder` (writes), `haiku-scout` (read-only), `haiku-tickets` (Plane) | each precise unit and every bulk lookup |

Each tier verifies the tier below it. A Haiku report is a claim, not evidence: the delegator reads the diff and re-runs the acceptance command.

## What is in the repo

Skills (`skills/`):

| Skill | Use |
| --- | --- |
| `tiered-delegation` | The full workflow: who decides what, what each prompt must contain, who verifies whose output. |
| `delegate-to-haiku` | When to hand batched, mechanical, read-only work (or a precise write unit) to Haiku. |
| `ship` | `/ship`: branch, test, commit, open a PR with `gh`, check CI with timeouts, and sync the matching Plane work item. Edit it if your tests or tracker differ. |
| `codebase-memory` | Graph tools instead of grep (see [codebase-memory](codebase-memory.md)). |

Agents (`agents/`):

| Agent | Model | Purpose |
| --- | --- | --- |
| `haiku-coder` | Haiku | One precisely specified unit of code: a function, a test file, a rename. Edits only the files it is told to, runs the acceptance command, never commits. |
| `haiku-scout` | Haiku | Batched read-only lookups across many files; returns the conclusion, not file dumps. |
| `haiku-tickets` | Haiku | All Plane reads and writes. Edit its tool list first (see below). |
| `sonnet-builder-low`, `sonnet-builder-medium` | Sonnet | Implement one spec task in a prepared worktree at low or medium effort. They do not push or open PRs. |
| `codebase-memory*` | | Graph verification agents (see [codebase-memory](codebase-memory.md)). |

## The Plane agent needs one edit

`haiku-tickets` lists the Plane MCP tools it may use. In this repo they are written as `mcp__plane__workitem` and so on. Your Plane MCP server will have its own tool prefix (look at `/mcp` or the tool names Claude prints), so replace `mcp__plane__` with it, or delete `haiku-tickets` and the Plane rules in `CLAUDE.example.md` and `ship` if your team uses another tracker. The same pattern works for any ticket system: give a Haiku agent the tracker's tools and forbid the main session from calling them directly.

## Optional: live progress panels

[`savvy-flow` and `savvy-progress`](https://github.com/JohnnyVizz/claude-kit) (by JohnnyVizz) add a `/savvy-flow` skill that plans, delegates to tiered workers and reviews, plus a progress bar and a live agents panel. Our `CLAUDE.example.md` includes a rule to report progress through its tools when they are installed and to skip silently when they are not.
