---
name: delegate-to-haiku
description: >-
  Route batched, mechanical, read-only work to the cheap haiku-scout subagent
  (Haiku) instead of doing it on the main model. Use when you are about to
  perform several similar well-specified lookups — "which of these N files
  import X", grep-and-tally across a tree, reading a set of configs to report
  one field, checking each package for some shape. Not for single one-off
  reads, work needing judgement or synthesis. For precise write work use haiku-coder.
---

# Delegate batched grunt work to Haiku

**Default for the main session and for every Sonnet builder: Haiku writes and looks things up; Sonnet and Opus orchestrate and validate.** When a task
contains 5+ similar lookups, or precise write units (a function, a test file, a rename,
repeated fixture edits), dispatch them to `haiku-scout` / `haiku-coder` before doing the work
inline. Doing it inline needs a reason (one item, needs judgement, faster than the prompt), and
a builder's final report must list its Haiku calls or say "none" with the reason.

The `haiku-scout` agent runs on Haiku and exists to absorb repetitive,
well-specified, read-only lookups so the main model isn't billed for grunt work.

## Use it when ALL of these hold

- The work is **several similar items** (roughly 5+), not one.
- Each item is **mechanical and fully specified** — no judgement call, no design
  decision, no "figure out what matters".
- It is **read-only** — greps, file reads, existence/shape checks, check-only
  lint/test runs. Nothing that edits files or touches remote state.
- You want **the conclusion**, not the raw file contents back. The subagent
  summarises; it does not stream files to you.

Good fits:

- "For each of these 40 modules, does it import `legacy_db`? List the ones that do."
- "Grep the tree for `TODO(agent)` and give me file + line + the line text."
- "Read every `pyproject.toml` under `packages/` and report the `python` version pin."
- "Which test files define a fixture named `client` without importing `pytest`?"

## Do NOT use it when

- It's a **single** file read or one small command — just do it inline. A
  subagent starts cold and costs a round trip; for one item that's slower and
  pricier.
- The task needs **synthesis or judgement** (reviewing code, deciding an
  approach, interpreting ambiguous results).
- You need the **full file content** in your own context to work with next.
- The work **mutates** anything (Edit/Write, migrations, network calls, git
  commits).

## How to dispatch

Send **one** `Agent` call for the whole batch (not one per item):

```
Agent(
  subagent_type: "haiku-scout",
  description: "<3-5 word label>",
  prompt: "<explicit spec: the exact set of files/dirs/patterns, the exact
           question per item, and the EXACT output format you want back>"
)
```

Make the prompt self-contained — the subagent starts with no context from this
conversation. Spell out paths, the per-item question, and the output shape
(e.g. "return a markdown table: file | imports_legacy_db | notes").

Background it unless your very next step depends on the result.

## Writing code: `haiku-coder`

For small, precise **write** work use `haiku-coder` instead (one function, one test
file for a named function, a mechanical rename, boilerplate). It edits only the files
you name and runs your acceptance command. It never commits.

```
Agent(
  subagent_type: "haiku-coder",
  description: "<3-5 word label>",
  prompt: "<working dir; exact file path(s) it may edit; signature or behaviour;
           acceptance command; anything it must not touch>"
)
```

Rules for the delegator:

- One unit per call; launch independent units in parallel.
- **Verify before trusting.** Read the diff and re-run the acceptance command yourself.
  Haiku's report is a claim, not evidence.
- Do not hand it design decisions, ambiguous specs, or cross-module changes.
- If a unit fails twice, take it back and write it yourself.

See the `tiered-delegation` skill for the Opus / Sonnet / Haiku workflow.

## Note

`model: haiku` in an agent definition resolves to the current Haiku. Do not hardcode a
version in prompts or docs; check the model list in the environment if a version matters.
