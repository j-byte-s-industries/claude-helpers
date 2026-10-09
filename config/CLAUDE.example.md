@RTK.md

## CI & PR Workflow
- After pushing to a PR, check CI with `gh pr checks <PR#>`. Never poll silently for long.
- If no checks start within ~3 minutes, tell the user, check githubstatus.com, and offer an empty retrigger commit (`git commit --allow-empty -m 'ci: retrigger' && git push`). Cap retriggers at 2.
- Cap any single CI poll at 10 minutes. Report and exit instead of waiting.

## Project Management (Plane)
- In projects tracked in Plane (e.g. your main product project), when a PR is opened or merged, update the matching Plane work item state and add a comment linking the PR number, without being asked.

## Ticket Systems (Plane, Linear, Jira, Asana, GitHub Issues, etc.)
- All Plane reads and writes MUST go through the `haiku-tickets` subagent. State `READ` or `WRITE` in its prompt. It holds the Plane MCP tools; `haiku-scout` and `haiku-coder` do not.
- Other ticket systems: reads and writes go through Haiku subagents (`haiku-scout` for reads, `haiku-coder` for writes) until each gets its own tool-equipped agent.
- Never call ticket-system MCP tools (e.g. Plane `workitem*`, `state`, `project`, `cycle`, `module`) directly from the main session.
- Batch related operations into one subagent call. Give exact IDs, target states, comment text, and output format.
- Require the subagent to report the exact tool calls made and raw results. Verify writes with a follow-up `READ` call (`haiku-tickets` for Plane) before reporting done.

## Agents & Delegation
- Require subagents to cite exact commands and output behind every claim in PR descriptions.
- Before opening or merging a subagent PR, verify its claims about env vars, credentials, and deployed config against the live system and the actual `git diff`. Fix mismatched descriptions.
- Treat credential failures (e.g. an FTP `530 Login incorrect`) as a blocker for the user, separate from code changes.

- Tiering: the main session (Opus) writes specs; `sonnet-builder-low`/`-medium` implement broad tasks; builders delegate precise code/test units to `haiku-coder` and read-only lookups to `haiku-scout`. Each tier verifies the tier below it. See the `tiered-delegation` skill.
- Progress reporting: when delegating to subagents, use the savvy-progress plugin if its tools are available. The orchestrator calls `mcp__savvy-progress__progress` after presenting the plan (`title`, `total`, `tasks` whose titles equal the Agent `description`, `phase: "delegate"`), again with `done` as each task is accepted, and once with `finished: true` at the end. Workers call `mcp__savvy-progress__step` (`done`, `total`, `note`); it may be a deferred tool, so load it with ToolSearch first. Skip silently if the tools are absent.

## Preflight
- Before implementing a task that touches external systems, test every needed credential and connection (databases, file servers, third-party APIs). Report working vs BLOCKED up front. Treat placeholder values ("your-key-here", empty) as BLOCKED, not FAILED.

## Spec-driven features
- For large multi-PR features: write `specs/<feature>/requirements.md`, `design.md`, `tasks.md`, wait for approval, then implement one task per PR with tests green, and create/update a Plane work item per task.
