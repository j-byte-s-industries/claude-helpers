# claude-helpers

Everything we use to set up [Claude Code](https://claude.com/claude-code) for day-to-day work, in one place: skills, subagents, hooks, a `CLAUDE.md` template, a settings example, a plugin marketplace with our own mods, and setup guides for the third-party tools we rely on (RTK, codebase-memory-mcp, caveman).

New to the team? Follow [Getting started](#getting-started) from top to bottom. It takes about 15 minutes.

The stack in one sentence: **spend fewer tokens** (RTK, codebase-memory, caveman, a read guard), **spend them on the right model** (tiered delegation to Sonnet and Haiku), and **see where they went** (the `model-usage` mod).

## What is in here

| Path | What it is |
| --- | --- |
| [`skills/`](skills) | Skills: `tiered-delegation`, `delegate-to-haiku`, `ship`, `codebase-memory`. |
| [`agents/`](agents) | Subagents: `haiku-coder`, `haiku-scout`, `haiku-tickets`, `sonnet-builder-low`, `sonnet-builder-medium`, `codebase-memory`, `codebase-memory-scout`, `codebase-memory-auditor`. |
| [`hooks/`](hooks) | Hook scripts: `big-read-guard.sh`, `lint-after-edit.sh`, and three `cbm-*` graph-context hooks. |
| [`config/`](config) | `CLAUDE.example.md` (global instructions), `RTK.md`, `settings.example.json` (hooks, plugins, env). |
| [`plugins/model-usage`](plugins/model-usage) | A mod: `/model-usage` shows token usage per model as an activity graph, with cost share dials and account usage limits. |
| [`docs/`](docs) | Guides: [RTK](docs/rtk.md), [codebase-memory](docs/codebase-memory.md), [caveman](docs/caveman.md), [tiered delegation](docs/delegation.md). |
| [`install.sh`](install.sh) | Copies the skills, agents and hooks into `~/.claude` without overwriting anything. |

## The tools, in short

| Tool | What it does | Guide |
| --- | --- | --- |
| [RTK](https://github.com/rtk-ai/rtk) | Filters command output (`git`, `gh`, `docker`, tests...) before it reaches the model. | [docs/rtk.md](docs/rtk.md) |
| [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) | Indexes the repo into a knowledge graph so Claude can answer structural questions in a few hundred tokens instead of grepping. | [docs/codebase-memory.md](docs/codebase-memory.md) |
| [caveman](https://github.com/JuliusBrussee/caveman) | Terse reply style; same content, fewer tokens. | [docs/caveman.md](docs/caveman.md) |
| Tiered delegation | The main session plans, Sonnet builds, Haiku does the precise units and lookups. | [docs/delegation.md](docs/delegation.md) |
| `big-read-guard.sh` | Denies whole-file reads of files over 40 KB and points Claude at `haiku-scout` or `offset`/`limit`. | below |
| `lint-after-edit.sh` | After an edit, runs `ruff check --fix` on Python files and `yamllint` on YAML. Never blocks. | below |
| [`model-usage`](plugins/model-usage) | Where your tokens went, per model. | [plugin README](plugins/model-usage/README.md) |
| [savvy-flow / savvy-progress](https://github.com/JohnnyVizz/claude-kit) | Optional: a plan-delegate-review skill, a progress bar and a live agents panel (by JohnnyVizz). | [docs/delegation.md](docs/delegation.md) |

## Getting started

Prerequisites: Claude Code, `git`, [`gh`](https://cli.github.com) (logged in), and [`jq`](https://jqlang.github.io/jq/) (the two custom hooks use it). `ruff` and `yamllint` are optional; the lint hook skips a linter that is not installed.

### 1. Get this repo

```bash
git clone https://github.com/j-byte-s-industries/claude-helpers.git ~/claude-helpers
cd ~/claude-helpers
```

### 2. Install RTK

```bash
brew install rtk          # or: curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
rtk init -g
```

Details and the "wrong package" check: [docs/rtk.md](docs/rtk.md).

### 3. Install codebase-memory-mcp

```bash
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash
```

Details: [docs/codebase-memory.md](docs/codebase-memory.md).

### 4. Install the skills, agents and hooks

```bash
./install.sh --dry-run    # see what would be copied
./install.sh              # copies what is missing; never overwrites
```

It skips files that already exist (for example the ones the codebase-memory installer created). Use `--force` to replace them; the old copy is kept as `*.bak.<time>`. It does not touch `settings.json` or `CLAUDE.md`.

### 5. Merge the settings

Open [`config/settings.example.json`](config/settings.example.json) and merge what you want into `~/.claude/settings.json`:

- `hooks`: the read guard, lint, RTK and codebase-memory hooks.
- `enabledPlugins` and `extraKnownMarketplaces`: the caveman plugin.
- `env.CLAUDE_CODE_PLUGIN_DIRS`: loads the `model-usage` mod from your clone. If you already have a value, append with `:` instead of replacing it.

If you installed RTK with `rtk init -g` and codebase-memory with its own installer, they may already have added their hooks. Do not register the same hook twice.

### 6. Add the global instructions

[`config/CLAUDE.example.md`](config/CLAUDE.example.md) is our `~/.claude/CLAUDE.md`. Copy the parts you want, and read it first: it describes how we handle CI, PRs, Plane tickets, delegation and preflight checks. Edit anything that is specific to us (the Plane rules, the spec workflow). Copy [`config/RTK.md`](config/RTK.md) next to it if you keep the `@RTK.md` line.

### 7. Install caveman and the model-usage mod

```
/plugin marketplace add JuliusBrussee/caveman
/plugin install caveman@caveman
```

The `model-usage` mod loads through `CLAUDE_CODE_PLUGIN_DIRS` from step 5, or through this repo's marketplace:

```
/plugin marketplace add j-byte-s-industries/claude-helpers
/plugin install model-usage@claude-helpers
```

Start a new Claude Code session.

### 8. Check it works

| Check | Expected |
| --- | --- |
| `rtk --version` and `rtk gain` | prints a version and a savings dashboard |
| `codebase-memory-mcp --version` | prints a version |
| `/mcp` in Claude Code | lists `codebase-memory-mcp` |
| ask Claude to read a file over 40 KB with no range | the read is denied with a hint to use `haiku-scout` or `offset`/`limit` |
| `/model-usage` | opens the usage pane (after a few requests it has data) |
| a `git status` in a Bash call | runs through `rtk` and returns compact output |

## The custom hooks

| Hook | Event | Behavior |
| --- | --- | --- |
| `big-read-guard.sh` | PreToolUse, `Read` | Denies a whole-file read (no `offset`/`limit`) of a file over 40,000 bytes. Images, PDFs and notebooks are exempt. |
| `lint-after-edit.sh` | PostToolUse, `Edit` and `Write` | Runs `ruff check --fix` on `.py` files and `yamllint -d relaxed` on `.yml`/`.yaml` files if the tool is installed. Output goes to stderr; it never blocks. |
| `cbm-session-reminder`, `cbm-subagent-reminder`, `cbm-code-discovery-gate` | SessionStart, SubagentStart, Grep/Glob/Read | Add code-graph context via `codebase-memory-mcp hook-augment`. They fail open. |

## Adapting it for your team

- **Plane.** The `ship` skill, the `haiku-tickets` agent and the ticket rules in `CLAUDE.example.md` assume Plane. Replace them for your tracker, or remove them. `haiku-tickets` needs its tool prefix edited first (see [docs/delegation.md](docs/delegation.md)).
- **Languages.** `lint-after-edit.sh` knows Python and YAML. Add a `case` branch for your languages.
- **Budget and turn limits.** Our personal settings cap turns and spend; they are left out of the example on purpose. Set limits that suit you.
- **Prices.** The `model-usage` mod estimates cost with a price table in `plugins/model-usage/hooks/register.tsx`; update it when prices change.

## Versions we tested

Claude Code 2.1.295, `rtk 0.49.0`, `codebase-memory-mcp 0.10.8`. Mods use an early-access Claude Code API that may change between releases.

## Contributing

Add a skill under `skills/<name>/SKILL.md`, an agent under `agents/<name>.md`, or a plugin under `plugins/<name>/` (then list it in `.claude-plugin/marketplace.json`). Check a plugin with `claude plugin validate plugins/<name>`, and the marketplace with `claude plugin validate .`. Keep personal paths, hostnames, IDs and credentials out of the repo; this repository is public.

## Credits

Third-party tools are not bundled here, only documented; each has its own license and repository: [rtk-ai/rtk](https://github.com/rtk-ai/rtk), [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp), [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman), [JohnnyVizz/claude-kit](https://github.com/JohnnyVizz/claude-kit).

## License

MIT, see [LICENSE](LICENSE).
