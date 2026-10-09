---
name: ship
description: Branch, test, commit, open PR, verify CI with timeouts, and sync the matching Plane work item. Use for /ship.
---
1. Create a feature branch named after the Plane work item ID (ask if unknown; if lookup needed, use `haiku-scout` per Plane access rule).
2. Run tests (pytest / gradle build as appropriate). Stop if they fail.
3. Commit, push, and open a PR with `gh pr create --fill`.
4. Run `gh pr checks --watch` with a 10-minute limit. If no checks start within 3 minutes, tell the user, check githubstatus.com, and offer an empty retrigger commit.
5. Update the Plane work item state and add a comment linking the PR.

## Plane access rule
All Plane reads and writes go through a `haiku-coder` subagent (writes) or `haiku-scout` subagent (reads). Never call `mcp__*__workitem*`, `state`, `project` or other Plane MCP tools from the main session.
- Reads (look up work item, list states, resolve state ID): `haiku-scout`. Give exact work item ID and output format.
- Writes (update state, add comment): `haiku-coder`. Give exact work item ID, target state name, and comment text with PR number/URL.
- Batch several Plane operations into one subagent call.
- Require the subagent to report the exact tool calls made and their raw results. Verify the final state via a `haiku-scout` read before reporting done.
