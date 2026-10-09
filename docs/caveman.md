# caveman: shorter replies

[caveman](https://github.com/JuliusBrussee/caveman) is a Claude Code plugin that makes Claude answer in terse "caveman" style: fewer filler words, same technical content. It claims to cut output tokens substantially while keeping code, commands and error messages exact.

## Install

In Claude Code:

```
/plugin marketplace add JuliusBrussee/caveman
/plugin install caveman@caveman
```

or from a shell: `claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman`. The plugin then starts with every interactive session, subagents included. The project also offers a CLI proxy and installers for other agents; see its README.

`config/settings.example.json` shows the equivalent `enabledPlugins` and `extraKnownMarketplaces` entries.

## Switching it off

Say "stop caveman" or "normal mode" in the chat, or `/caveman off`. Levels: `lite`, `full` (default), `ultra`, and the `wenyan` variants.

## One rule worth copying

Brevity should not shorten documents. Our `config/RTK.md` ends with a rule that when caveman mode is active and Claude writes a persisted technical document (a spec, design doc, README, ADR, code comment), it must write it at full length and detail. Caveman style is for chat replies only. Keep that rule in your own `CLAUDE.md`.
