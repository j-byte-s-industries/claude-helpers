# claude-helpers

Skills, plugins and mods for [Claude Code](https://claude.com/claude-code), in one place. Every item is a standalone plugin under `plugins/`: install only what you need.

| Plugin | Type | What it does |
| --- | --- | --- |
| [model-usage](plugins/model-usage) | mod | `/model-usage` opens a pane with token usage per model: a GitHub-style activity graph (hourly or daily), a pixel crab in a costume per model family, a cost share dial per model, and the account's usage limits. |

## Install

In Claude Code:

```
/plugin marketplace add j-byte-s-industries/claude-helpers
/plugin install model-usage@claude-helpers
```

Start a new session afterwards. To load a plugin by hand, or for every session through `CLAUDE_CODE_PLUGIN_DIRS`, see the plugin's own README.

## Layout

```
.claude-plugin/marketplace.json   the catalog `/plugin marketplace add` reads
plugins/<name>/
  .claude-plugin/plugin.json      manifest
  README.md                       what it does, install, how it works
  hooks/                          a mod: hooks.json and the hooks module
  types/                          a mod: its $.state contract
```

Check a plugin before publishing: `claude plugin validate plugins/<name>`, and the catalog with `claude plugin validate .`.

## License

MIT, see [LICENSE](LICENSE).
