---
name: wave
description: Autonomously run the next implementation waves of a spec with parallel builders in isolated git worktrees, CI-gated merges, and Plane sync. Use for /wave or "continue the tasks autonomously".
---

# Wave runner

1. Read `specs/<feature>/tasks.md` (or the named spec). List unblocked tasks and each task's file set. Write the dependency/file-overlap plan to `WAVES.md`.
2. Preflight: check `gh auth status`, the toolchain versions the stack needs (e.g. `java -version`), required CLIs, credentials; list placeholders in env files. Report BLOCKED items to the user, continue with the rest.
3. Per task (max 3 parallel, non-overlapping files): `git worktree add ../wt-<TASK_ID> -b feat/<TASK_ID>`. Dispatch `sonnet-builder-low|medium` (Haiku for tasks under ~100 lines) with `run_in_background: false` for Haiku units. Ban `git stash`. Builder reports done only after typecheck, lint and targeted tests pass, pasting exit codes.
4. After each wave: rebase on main, run the full suite once, open PRs with `gh`, check `gh pr checks <PR#>`. If no checks start in ~3 min, empty retrigger commit (max 2). Cap any poll at 10 min.
5. Merge green PRs. Update Plane via `haiku-tickets` (WRITE, then READ to verify). Mark Done only if acceptance criteria are evidenced.
6. Continue to next wave without asking. Stop only on a hard blocker or a failure not fixed in 3 attempts; write blockers to `HANDOFF.md`.
7. End with table: task | PR | CI | evidence | status.
