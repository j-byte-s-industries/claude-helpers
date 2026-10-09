"""Backfill model usage from Claude Code session transcripts.

The model-usage mod only sees requests made while it is loaded. Every request
Claude Code makes is also written to a transcript under ~/.claude/projects, with
its full usage: the 5-minute and 1-hour cache-write split, the speed (fast mode)
and the inference geography. This script reads those transcripts and writes what
the mod needs:

- per-session 5-minute buckets, the same cells the mod writes for live sessions,
  so the 5-hour and weekly limit windows include sessions the mod never saw;
- fresh tokens per local day and local hour, for the activity graphs.

It is incremental: a state file holds each transcript's byte offset and its
contribution so far, so a run parses only lines added since the last one. A
transcript that shrank (rewritten) is read again from the start.

Usage: backfill.py <projects dir> <state path> <output path> <prices json> <now ms>

The prices JSON comes from the mod, so the price table lives in one place:
{"table": [[regex, [in, out, read, write1h]], ...], "haiku55": {"re": regex,
"long": tokens, "prices": [short, long]}, "fallback": [in, out, read, write1h]}.
"""

import calendar
import json
import os
import re
import sys
import time

BUCKET_MS = 300_000
# Cells kept per session: a day past the weekly window, matching the mod.
KEEP_BUCKET_MS = 8 * 24 * 3_600_000
# Hourly graph keeps eight days, daily graph two hundred, matching the mod.
KEEP_HOURS_MS = 8 * 24 * 3_600_000
KEEP_DAYS_MS = 200 * 24 * 3_600_000
# Transcripts not written for longer than the daily graph's span are skipped.
MAX_AGE_S = KEEP_DAYS_MS / 1000
# Message ids remembered per transcript, to skip the repeated lines one
# response is logged as (one line per content block, same usage on each).
RECENT_IDS = 200


def load_prices(raw):
    p = json.loads(raw)
    table = [(re.compile(pattern), price) for pattern, price in p["table"]]
    haiku = p["haiku55"]

    return table, re.compile(haiku["re"]), haiku["long"], haiku["prices"], p["fallback"]


def price_of(prices, model, prompt):
    table, haiku_re, haiku_long, haiku_prices, fallback = prices
    model = model.lower()
    if haiku_re.search(model):
        return haiku_prices[1 if prompt > haiku_long else 0]
    for pattern, price in table:
        if pattern.search(model):
            return price

    return fallback


def usd_of(prices, model, usage):
    """One response's USD at standard API rates, with its real cache-write split."""
    inp = usage.get("input_tokens") or 0
    out = usage.get("output_tokens") or 0
    read = usage.get("cache_read_input_tokens") or 0
    write = usage.get("cache_creation_input_tokens") or 0
    split = usage.get("cache_creation") or {}
    write_1h = split.get("ephemeral_1h_input_tokens")
    write_5m = split.get("ephemeral_5m_input_tokens")
    if write_1h is None and write_5m is None:
        # No split reported: the mod's assumption, an hour.
        write_1h, write_5m = write, 0
    i, o, r, w1h = price_of(prices, model, inp + read + write)
    usd = (inp * i + out * o + read * r + (write_1h or 0) * w1h + (write_5m or 0) * i * 1.25) / 1e6
    # Fast mode is 2x every token price on every model that offers it.
    if usage.get("speed") == "fast":
        usd *= 2
    # US-only inference is 1.1x every token price.
    if usage.get("inference_geo") == "us":
        usd *= 1.1

    return usd


def local_keys(ms):
    t = time.localtime(ms / 1000)

    return time.strftime("%Y-%m-%d", t), time.strftime("%Y-%m-%dT%H", t)


def parse_ts(ts):
    """Milliseconds since the epoch for a transcript's UTC timestamp, "2026-10-08T22:58:32.237Z"."""
    try:
        base, _, frac = ts.rstrip("Z").partition(".")

        return calendar.timegm(time.strptime(base, "%Y-%m-%dT%H:%M:%S")) * 1000 + int((frac or "0")[:3].ljust(3, "0"))
    except ValueError:
        return None


def session_of(path):
    """The session a transcript belongs to: its own name, or for a subagent the session folder above it."""
    parent = os.path.basename(os.path.dirname(path))
    if parent == "subagents":
        return os.path.basename(os.path.dirname(os.path.dirname(path)))

    return os.path.splitext(os.path.basename(path))[0]


def empty_entry(path):
    return {"size": 0, "offset": 0, "sid": session_of(path), "ids": [], "buckets": {}, "daily": {}, "hourly": {}}


def scan_file(path, entry, prices):
    """Reads the transcript from the entry's offset and folds new responses into it."""
    is_sub_file = os.path.basename(os.path.dirname(path)) == "subagents"
    recent = list(entry["ids"])
    seen = set(recent)
    with open(path, "rb") as f:
        f.seek(entry["offset"])
        data = f.read()
    # Only whole lines: a line still being written is read next time.
    end = data.rfind(b"\n") + 1
    for raw in data[:end].splitlines():
        if b'"usage"' not in raw or b'"assistant"' not in raw:
            continue
        try:
            row = json.loads(raw)
        except ValueError:
            continue
        if row.get("type") != "assistant":
            continue
        msg = row.get("message") or {}
        usage = msg.get("usage")
        model = msg.get("model")
        if not usage or not model or model.startswith("<"):
            continue
        rid = f'{msg.get("id")}:{row.get("requestId")}'
        if rid in seen:
            continue
        seen.add(rid)
        recent.append(rid)
        at = parse_ts(row.get("timestamp") or "")
        if at is None:
            continue
        inp = usage.get("input_tokens") or 0
        out = usage.get("output_tokens") or 0
        read = usage.get("cache_read_input_tokens") or 0
        write = usage.get("cache_creation_input_tokens") or 0
        is_sub = is_sub_file or bool(row.get("isSidechain"))
        b = str(at // BUCKET_MS * BUCKET_MS)
        cell = entry["buckets"].setdefault(model, {}).setdefault(b, [0, 0, 0, 0, 0, 0, 0])
        cell[0] += 1
        cell[1] += inp
        cell[2] += out
        cell[3] += read
        cell[4] += write
        cell[5] += 1 if is_sub else 0
        cell[6] += usd_of(prices, model, usage)
        day, hour = local_keys(at)
        fresh = inp + out + write
        days = entry["daily"].setdefault(model, {})
        days[day] = days.get(day, 0) + fresh
        hours = entry["hourly"].setdefault(model, {})
        hours[hour] = hours.get(hour, 0) + fresh
    entry["offset"] += end
    entry["ids"] = recent[-RECENT_IDS:]


def prune(entry, now_ms):
    bucket_from = now_ms - KEEP_BUCKET_MS
    day_from, _ = local_keys(now_ms - KEEP_DAYS_MS)
    _, hour_from = local_keys(now_ms - KEEP_HOURS_MS)
    for model in list(entry["buckets"]):
        cells = {b: c for b, c in entry["buckets"][model].items() if int(b) >= bucket_from}
        if cells:
            entry["buckets"][model] = cells
        else:
            del entry["buckets"][model]
    for name, start in (("daily", day_from), ("hourly", hour_from)):
        for model in list(entry[name]):
            kept = {k: v for k, v in entry[name][model].items() if k >= start}
            if kept:
                entry[name][model] = kept
            else:
                del entry[name][model]


def main():
    projects, state_path, out_path, prices_raw, now_raw = sys.argv[1:6]
    prices = load_prices(prices_raw)
    now_ms = int(now_raw)
    try:
        with open(state_path) as f:
            state = json.load(f)
    except (OSError, ValueError):
        state = {}
    # A new price table invalidates every stored USD figure: start over.
    if state.get("prices") != prices_raw:
        state = {"prices": prices_raw, "files": {}}
    files = state["files"]

    present = set()
    for root, _dirs, names in os.walk(projects):
        for name in names:
            if not name.endswith(".jsonl"):
                continue
            path = os.path.join(root, name)
            try:
                st = os.stat(path)
            except OSError:
                continue
            if now_ms / 1000 - st.st_mtime > MAX_AGE_S and path not in files:
                continue
            present.add(path)
            entry = files.get(path)
            if entry is None or st.st_size < entry["size"]:
                entry = files[path] = empty_entry(path)
            if st.st_size > entry["offset"]:
                scan_file(path, entry, prices)
            entry["size"] = st.st_size
            prune(entry, now_ms)
    # A transcript that is gone keeps its graph counts (the mod keeps the larger
    # of its own and these) but no longer needs its offset.
    for path in list(files):
        if path not in present:
            prune(files[path], now_ms)
            if not files[path]["daily"]:
                del files[path]

    sessions, daily, hourly = {}, {}, {}
    for entry in files.values():
        sess = sessions.setdefault(entry["sid"], {})
        for model, cells in entry["buckets"].items():
            into = sess.setdefault(model, {})
            for b, c in cells.items():
                cur = into.get(b)
                into[b] = list(c) if cur is None else [x + y for x, y in zip(cur, c)]
        for target, name in ((daily, "daily"), (hourly, "hourly")):
            for model, counts in entry[name].items():
                into = target.setdefault(model, {})
                for k, v in counts.items():
                    into[k] = into.get(k, 0) + v
    sessions = {sid: models for sid, models in sessions.items() if models}

    tmp = f"{state_path}.tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, separators=(",", ":"))
    os.replace(tmp, state_path)
    tmp = f"{out_path}.tmp"
    with open(tmp, "w") as f:
        json.dump({"updatedAt": now_ms, "sessions": sessions, "daily": daily, "hourly": hourly}, f, separators=(",", ":"))
    os.replace(tmp, out_path)


if __name__ == "__main__":
    main()
