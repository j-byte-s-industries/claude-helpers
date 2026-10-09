---
name: tiered-delegation
description: >-
  Opus / Sonnet / Haiku delegation workflow for implementing specs. Use when
  planning or dispatching implementation work: the main (Opus) session writes the
  spec, Sonnet builders (sonnet-builder-low/medium) implement broad tasks, and they
  delegate small precise code or test units to haiku-coder and read-only lookups
  to haiku-scout. Covers who decides what, what each prompt must contain, and who
  verifies whose output.
---

# Tiered delegation: Opus, Sonnet, Haiku

Match model cost to the kind of decision being made.

| Tier | Agent | Owns |
|------|-------|------|
| Opus (main session) | none, the session itself | Requirements, design, task breakdown, acceptance commands, review of Sonnet results, merge decisions |
| Sonnet | `sonnet-builder-low` / `sonnet-builder-medium` | Orchestrate and validate one broad task in one worktree: split it into units, write the unit prompts, integrate and validate Haiku output, run the verify command and fast gates, commit |
| Haiku | `haiku-coder` (writes), `haiku-scout` (read-only) | The writing: each precise unit (function, test file, component, rename, boilerplate, fixture edits) and every lookup |

Subagents can spawn subagents here: a Sonnet builder has the `Agent` tool and can call `haiku-coder`.

## Mandatory hand-off rules

These are rules, not suggestions. Skipping them has happened before: builders were dispatched
without being told to use Haiku, so none did.

1. **Opus names the Haiku units.** Every Sonnet builder prompt has a "Haiku units" section that
   lists the units to send to `haiku-coder` (with file paths and acceptance commands where
   known) and the lookups to send to `haiku-scout`. If the spec has no mechanical units, the
   prompt says "Haiku units: none, because <reason>".
2. **Sonnet orchestrates and validates; Haiku writes.** A Sonnet builder sends the code, test and
   lookup work to Haiku (see its agent definition) and spends its own effort on unit design,
   prompts, validating diffs, running the gates and committing. It writes code itself only after
   a unit failed twice at Haiku, or when the unit is a few lines.
3. **Reports prove it.** Every builder report ends with a "Haiku delegations" line: each call and
   its outcome, or "none" plus the reason. Opus treats a missing line as an incomplete report and
   asks for it before accepting the task.
4. **Opus uses `haiku-scout` too.** Before reading many files or running 5+ similar greps in the
   main session (transcript summaries, existence checks, tallies), Opus dispatches one
   `haiku-scout` call with an exact output format (see the `delegate-to-haiku` skill).
5. **Reviews.** Review agents stay on Sonnet; the facts they need (file lists, grep tallies,
   diff stats) are gathered by `haiku-scout` first when that is 5+ items.

## Opus: what the spec must contain

For each task in `tasks.md`:

- Files to touch and files not to touch.
- The behaviour or interface, precisely enough that a unit can be coded without asking questions.
- A verify command that fails before the work and passes after.
- A "Haiku units" section: the units mechanical enough for Haiku (rule 1 above). The builder adds any it finds.

Pick `sonnet-builder-low` for well-trodden work and `sonnet-builder-medium` when the task needs some design judgement inside the task. Escalate to the main session when the design itself is in doubt.

## Sonnet: how to split and validate a task

1. Read the task and design, then list the units.
2. Decide the interfaces and unit boundaries yourself, so units can be written independently.
3. Send every unit to `haiku-coder`, with the decisions in the prompt: signature, behaviour,
   cases, acceptance command. Send every lookup to `haiku-scout`.
4. Launch independent units in parallel. Cap at about 5 per task.
5. Write a unit yourself only if it failed twice at Haiku or is a few lines (faster than the
   prompt).
6. Validate: read every diff, re-run every acceptance command, run the full gates, then commit.

## Every Haiku prompt carries

- Working directory (worktree path).
- Exact file path(s) it may edit or create.
- Signature or behaviour, or the cases to test.
- An acceptance command.
- What it must not touch.

## Who verifies whose output

- Haiku's report is a claim. The delegating Sonnet reads the diff and re-runs the acceptance command before keeping it.
- Sonnet's report is a claim. Opus reads `git diff` and re-runs the task's verify command before accepting the task, and checks the PR description against the diff (see the global rule on subagent PR claims).
- A unit that fails twice goes back up one tier. Do not loop a cheaper model on a task it cannot do.
- Haiku never commits. Sonnet commits. Nobody below Opus pushes or opens PRs.

## When not to use this

- Small tasks: one file, a few lines. Do them inline.
- Exploratory or ambiguous work: spec it first, or investigate in the main session.
- Anything involving credentials, migrations, or remote systems: keep it at Sonnet or above and follow the preflight rule.
