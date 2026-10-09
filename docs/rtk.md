# RTK: smaller command output

[RTK](https://github.com/rtk-ai/rtk) is a CLI proxy that filters and summarizes the output of common developer commands (`git`, `gh`, `docker`, test runners, `ls`, `find` and more) before it reaches the model. The project reports 60-90% fewer tokens on those commands. A hook rewrites Bash commands for you, so `git status` runs as `rtk git status` and Claude receives the compact result.

Tested here with `rtk 0.49.0`.

## Install

Pick one (from the RTK README):

```bash
brew install rtk                                      # macOS / Linux with Homebrew
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh   # installs to ~/.local/bin
cargo install --git https://github.com/rtk-ai/rtk
```

Make sure `~/.local/bin` is on your `PATH`, then check it is the right tool (another project named "rtk" exists on crates.io):

```bash
rtk --version
rtk gain        # shows the savings dashboard; if this fails you have the wrong package
```

## Hook it into Claude Code

```bash
rtk init -g     # global; adds the Bash hook and an RTK.md of instructions
```

Restart Claude Code. The relevant hook in `settings.json` is:

```json
{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "rtk hook claude" }] }
```

[`config/settings.example.json`](../config/settings.example.json) already contains it. [`config/RTK.md`](../config/RTK.md) is the instruction file our setup imports from `CLAUDE.md` with `@RTK.md`. It tells Claude that condensed output is the complete result and when to re-run a command through `rtk proxy <cmd>`. `rtk init -g` writes its own version, so you can keep that one instead.

## Good to know

- The hook only runs on the **Bash** tool. The built-in `Read`, `Grep` and `Glob` tools are not rewritten. That is why this repo also ships the `big-read-guard.sh` hook and the codebase-memory tools.
- If a result looks empty or garbled, run the command as `rtk proxy <cmd>` to get the raw output.
- RTK does not break Claude's prompt cache, according to the RTK README.
