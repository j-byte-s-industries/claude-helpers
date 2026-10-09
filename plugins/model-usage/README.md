# model-usage

A [Claude Code](https://claude.com/claude-code) mod that shows how much of each model you use. One `/model-usage` command opens a pane with a card per model: a GitHub-style activity graph of token usage, a pixel-art crab in a costume per model family, a dial with the model's share of the session cost, and the account's usage limits at the bottom.

<p align="center">
  <img src="docs/tiles.svg" alt="Summary tiles: models, requests, tokens today" width="680"><br>
  <img src="docs/card-opus.svg" alt="Opus card: the old sage, 6 month activity graph, cost share dial" width="680"><br>
  <img src="docs/card-sonnet.svg" alt="Sonnet card: the young professional, responding" width="680"><br>
  <img src="docs/card-haiku.svg" alt="Haiku card: the kid in the ball cap, 7 day hourly graph" width="680"><br>
  <img src="docs/limits.svg" alt="Usage limits: 5-hour and weekly windows" width="680">
</p>

> The images above are drawn by the mod's own code from made-up sample data. They show the layout, not real usage. They are static: in Claude Code the crabs walk while their model is answering.

## What it shows

**One card per model.** Every model used in the selected timeframe or the limit window gets its own bordered section, ordered by tokens in the selected timeframe, busiest first, so switching timeframe can change the order. Ties go to the model with the higher estimated cost in the limit window. On the desktop app the pane draws as many cards as fit within the app's size limit for a pane (see [Limits](#limits)), and one line counts the rest.

- **Activity graph.** One square per day or per hour, shaded in five steps relative to that model's busiest square, in the model's own color. Hover a square for its exact date or hour and token count. Today's square is outlined, and the strongest squares twinkle.
- **Timeframe.** Four buttons choose the window, and the grid changes shape to match:

  | Timeframe | Grid | One square is |
  | --- | --- | --- |
  | 24 hours | one row of 24 squares | an hour |
  | 7 days | a row per weekday, 24 columns | an hour |
  | 30 days | a column per week, Sunday to Saturday | a day |
  | 6 months | up to 28 weeks, as wide as the pane allows | a day |

- **Pixel crab.** Each family gets a costume. The crab walks while that model is answering a request and a "responding" dot pulses next to it.

  | Family | Character |
  | --- | --- |
  | Haiku | a kid in a baseball cap, tossing a ball |
  | Sonnet | a young professional in a navy suit with a white shirt, red tie and a briefcase |
  | Opus | an old sage with a starry hat, a long beard and a glowing staff |
  | anything else | the plain crab |

- **Cost share dial.** A ring with the percentage of the selected limit window's estimated cost that came from this model, and the dollar amount under it. For example, if Opus cost $6.40 of an $11.00 window, its dial reads 58%.
- **Numbers.** Today, the last 7 days, the window total and the peak hour or day. Under the graph: the limit window's requests, and how many sessions contributed to them, (and how many came from subagents), input and output tokens, and cache reads and writes.

**Summary tiles.** Models seen, requests in the limit window, tokens today.

**Limit window.** A second row of buttons, **5 hours** and **Weekly**, chooses which usage limit the cost share dials, the request counts and the undocked summary measure against. See [All sessions in the current limit](#all-sessions-in-the-current-limit).

**Usage limits.** Under all the models, one bar per rate-limit window your account reports (5-hour, weekly, or a gateway spend limit): percent used, time until reset, colored green, amber from 70% and red from 90%. The session cost as Claude Code totals it is shown in the header. This section refreshes after every request and every 30 seconds.

**Terminal.** On a surface without SVG support (the terminal UI) the same content is drawn as text: colored `■` squares for the graph, block characters for the bars, and a small text sprite for each model.

**Undocked summary.** See [Dock and undock](#dock-and-undock).

**Status line.** A short entry such as `3 models · 412k tok` stays in the status line.

## All sessions in the current limit

The per-model numbers (requests, input and output, cache, and the cost share dial) are not just this session's. They add up every Claude Code session on the machine, inside the **selected usage limit window**:

- **5 hours** (the default) uses the 5-hour limit's own window: from five hours before its reset time (read from `$.session.usage()`) up to now. **Weekly** does the same with the weekly limit and seven days. Without a reading (no subscription, or before the first response), the window is the last five hours or the last seven days, and the card says `last 5h` or `last 7d` instead of `5h limit window` or `weekly limit window`.
- Every session writes a small file, `~/.claude/model-usage/usage-<session id>.json`, with its usage in 5-minute buckets for the last eight days. Each session reads all the files that were touched inside the window and adds them up. One writer per file means concurrent sessions never overwrite each other. Files untouched for eight days are deleted when a session starts.
- Sessions that never ran the mod are read from Claude Code's own transcripts (see [History from transcripts](#history-from-transcripts)). Where a session has both, the mod takes, per model and 5-minute bucket, whichever source counted more requests; the two count the same requests, so they are never added.
- Each card says how many sessions contributed, for example `5h limit window · 3 sessions · 42 req`.
- The window is cut at 5-minute buckets, so its edges are accurate to about 5 minutes.

What it cannot see: sessions on other machines and other apps (claude.ai, the API). The **Usage limits** bars at the bottom come from your account, so they include all of that, and can read higher than the sum of the cards. If the mod cannot write to `~/.claude/model-usage` it falls back to this session's numbers and still says `5h limit window`.

The activity graph is separate: its daily and hourly history lives in the plugin's own store, a single file shared by all sessions. Two sessions answering at the same instant can occasionally lose one update there; the next transcript read restores it.

## History from transcripts

Claude Code writes every response's usage to a session transcript under `~/.claude/projects/` (one `.jsonl` file per session, and one per subagent). `hooks/backfill.py` reads them, so sessions from before the mod was installed, or that ran without it, are counted too.

- **When.** When a session starts, every 60 seconds, and after each request, at most once a minute and one run at a time. It never runs from a drawing hook, because drawing may not write state.
- **Incremental.** A state file, `~/.claude/model-usage/backfill-state.json`, keeps each transcript's byte offset and what it has contributed, so a run reads only lines added since the last one. On about 330 MB of transcripts the first run took about 2 seconds and later runs about 0.1 seconds. A transcript that shrank is read again from the start, and a change to the price table starts the state over.
- **What it writes.** `~/.claude/model-usage/history.json`: per-session 5-minute buckets for the last eight days (the same cells session files hold), and fresh tokens per local day (200 days) and hour (8 days). The graphs keep, per day and hour, the larger of their own count and the transcripts' count, so the history outlives transcripts Claude Code deletes.
- **Repeats.** A response is logged once per content block with the same usage on each line; repeats of a message id are counted once.
- **Requirements.** `python3` on the `PATH`; the script uses the standard library only. If it fails, the footer under the cards says why, and the pane keeps the live counts.

The pane's footer shows the build and when the transcripts were last read, for example `transcripts read 10:33:31, 20 sessions`.

## Dock and undock

The pane can be docked or undocked, and each state has a button:

- **Docked:** the pane is open (beside the transcript or above the prompt, wherever Claude Code seats it). Its timeframe row ends with an **Undock** button, which closes the pane.
- **Undocked:** a one-line summary sits above the prompt: a stacked bar of each model's share of the limit window's cost, the shares as text, tokens today, and the 5-hour limit if your account reports one. **Dock** reopens the pane. The **✕** hides the summary until you run `/model-usage` again.

The summary appears as soon as there is usage to show, so a new session starts undocked. Other mods that draw above the prompt keep their own row: the summary is added beneath it, not in its place. Claude Code decides where a pane is seated (beside the transcript or inline); a mod cannot move it, which is why undocking collapses to the summary instead of a floating window.

## Install

Mods are built on function hooks, an early-access Claude Code API, tested here on Claude Code 2.1.295. It may change between releases.

### From the marketplace

In Claude Code:

```
/plugin marketplace add j-byte-s-industries/claude-helpers
/plugin install model-usage@claude-helpers
```

Start a new session afterwards. If the mod does not show up, load it by hand as below.

### By hand, for every session

```bash
git clone https://github.com/j-byte-s-industries/claude-helpers.git ~/claude-helpers
```

`git pull` in the clone updates it. Then add the plugin folder to `CLAUDE_CODE_PLUGIN_DIRS` through `env` in `~/.claude/settings.json`. Separate several folders with `:`, and append to the value if it is already set rather than replacing it:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/claude-helpers/plugins/model-usage"
  }
}
```

This works for the desktop app too. A mod loaded this way is read when a session starts, so start a new session after installing or updating it.

### For one session

```bash
claude --plugin-dir ~/claude-helpers/plugins/model-usage
```

## Use

Type `/model-usage` to open the pane. Press a timeframe button to change the window. Press **5 hours** or **Weekly** to choose the limit window. History is read from your existing session transcripts within a minute of the first session, so the graphs show your past use from the start, as far back as Claude Code has kept transcripts.

## How it works

- **Counting.** A `turn.step` hook sees every model request in the session, the main thread's and subagents', with the token counts and the model id that answered. It adds them to this session's file (see above) and to the graph's history. While a request is in flight, the model is marked as responding.
- **What the graph counts.** Input tokens + output tokens + cache-write tokens. Cache reads are left out on purpose: they are large and reflect how much context was re-read, not how much you worked.
- **History.** Daily totals are kept for 200 days and hourly totals for 8 days, in the plugin's own store (`$.store`, a JSON file under your Claude Code config folder). Nothing leaves your machine, and no network call is made by the mod. The session tallies live in the host's session state and start over with each session.
- **Cost share.** Each request is priced when it is counted, with the `PRICES` table in `hooks/register.tsx` (USD per million tokens: input, output, cache read, cache write; standard Claude API prices from the [pricing page](https://platform.claude.com/docs/en/about-claude/pricing) as of 2026-10-09), and each model's total in the limit window is divided by the total across models. The estimate is at API prices, not a bill and not what a subscription charges, so it can differ from the session cost Claude Code reports.
  - Each model version has its own prices, matched most specific first (for example Sonnet 5.5, then Sonnet 5, then older Sonnets). Claude Haiku 5.5 is priced per request by prompt length (input + cache read + cache write), with higher prices over 100,000 tokens.
  - Live requests report cache writes as one count, so they are priced at the 1-hour rate (2x input) Claude Code uses; fast mode is not visible to the hook. Transcripts carry the 5-minute and 1-hour split, the speed and the inference geography, so transcript prices include 5-minute writes (1.25x input), fast mode (2x) and US-only inference (1.1x).
  - A Claude model newer than the table is priced as the current Opus. Any other model (a local model behind a proxy, for example) is priced at zero.
- **Usage limits.** Read from `$.session.usage()`, the same figures the status line has. The section says so when there is no reading yet, for example without a subscription or before the first response finishes.
- **Drawing.** On the desktop app each card is one SVG (colors follow light and dark mode, and animation stops under reduced motion). On the terminal the same data is drawn with text elements. If the drawing code throws, the pane shows the error in red instead of staying blank.

## Files

```
.claude-plugin/plugin.json        manifest
.claude-plugin/marketplace.json   the catalog `/plugin marketplace add` reads
hooks/hooks.json                  points at the hooks module
hooks/register.tsx                the mod: hooks, drawing, price table
hooks/backfill.py                 reads session transcripts into history.json
hooks/*.test.ts                   tests
types/index.d.ts                  the $.state contract
docs/                             preview images, drawn from sample data
```

## Development

```bash
claude plugin validate plugins/model-usage
claude plugin test plugins/model-usage
```

The tests check that `/model-usage` opens the pane, that the pane draws on both the desktop and terminal surfaces, the price table (`pricing.test.ts`), the timeframe ordering (`sort.test.ts`), the limit window buttons (`window.test.ts`), and that a pane of many models with six months of history stays under the desktop app's size limit (`size.test.ts`). The test kit has no file access, so the session files and `backfill.py` are not covered by a test; `backfill.py` was checked against hand-made transcripts with hand-computed costs (repeated lines, the 5-minute and 1-hour cache-write split, fast mode, the Haiku 5.5 long-prompt tier, subagent transcripts, and reading only appended lines). The pane is mounted against a small in-memory stand-in for state. Changes to a mod loaded through `CLAUDE_CODE_PLUGIN_DIRS` show up in the next session. Use `claude --plugin-dir` while iterating.

## Limits

- It counts what this install sees. Usage from other machines or from claude.ai is not in the graph (the limits section does reflect the whole account).
- History goes back as far as Claude Code's transcripts do (it deletes old ones after a while, 30 days by default); from then on the mod keeps its own.
- Costs are estimates (see above).
- The desktop app leaves a pane blank when its drawing is over 262,144 characters. A model card is about 37,000, so the pane draws cards while they fit in a 180,000-character budget and counts the rest.
- Mods are an early-access API and may break between Claude Code releases.

## Credits

The progress panel of [savvy-progress](https://github.com/johnnyvizz/claude-kit/tree/main/plugins/savvy-progress) by johnnyvizz was the visual inspiration: SVG rows, the pixel crab, the stat tiles and the twinkling pixels. The pixel crab is in the style of Clawd from that project, and the costumes here are new.

## License

MIT, see [LICENSE](../../LICENSE).
