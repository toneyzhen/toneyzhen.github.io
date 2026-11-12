#!/usr/bin/env python3
"""Turn Claude and ChatGPT data exports into weekly token totals for the site's token chart.

Neither app reports tokens for chat use, so this estimates them from message text
(about 4 characters per token, the usual rule of thumb for English). Claude Code's
logs have exact counts, which can be added with --claude-code.

Only weekly totals are written. No message text, titles or timestamps finer than a
week leave your computer, so run this locally and commit just data/tokens.json.

Where the exports come from:
  ChatGPT:     Settings > Data controls > Export data   (emailed .zip with conversations.json)
  Claude:      Settings > Privacy > Export data         (emailed .zip with conversations.json)
  Claude Code: npx ccusage@latest daily --json > ccusage.json

Usage:
  python3 scripts/token_usage.py --chatgpt chatgpt-export.zip --claude claude-export.zip \\
      [--claude-code ccusage.json] [--weeks 26] [--out data/tokens.json]
"""

import argparse
import json
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

CHARS_PER_TOKEN = 4


def load_conversations(path):
    """Read conversations.json from an export .zip or a plain .json file."""
    if path.endswith(".zip"):
        with zipfile.ZipFile(path) as z:
            name = next((n for n in z.namelist() if n.endswith("conversations.json")), None)
            if not name:
                raise SystemExit(f"{path}: no conversations.json inside the zip")
            return json.loads(z.read(name))
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def estimate(text):
    return round(len(text) / CHARS_PER_TOKEN)


def week_of(day):
    return day - timedelta(days=day.weekday())  # Monday


def chatgpt_daily(conversations):
    daily = defaultdict(int)
    for convo in conversations:
        for node in (convo.get("mapping") or {}).values():
            msg = (node or {}).get("message") or {}
            role = (msg.get("author") or {}).get("role")
            if role not in ("user", "assistant"):
                continue
            stamp = msg.get("create_time") or convo.get("create_time")
            parts = (msg.get("content") or {}).get("parts") or []
            text = "".join(p for p in parts if isinstance(p, str))
            if stamp and text:
                daily[datetime.fromtimestamp(stamp, timezone.utc).date()] += estimate(text)
    return daily


def claude_daily(conversations):
    daily = defaultdict(int)
    for convo in conversations:
        for msg in convo.get("chat_messages") or []:
            if msg.get("sender") not in ("human", "assistant"):
                continue
            text = msg.get("text") or ""
            if not text:
                text = "".join(c.get("text", "") for c in msg.get("content") or [] if c.get("type") == "text")
            stamp = msg.get("created_at") or convo.get("created_at")
            if stamp and text:
                daily[datetime.fromisoformat(stamp.replace("Z", "+00:00")).date()] += estimate(text)
    return daily


def claude_code_daily(path):
    """ccusage's daily JSON. Counts input + output; cache reads would dwarf everything else."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    daily = defaultdict(int)
    for row in data.get("daily", []):
        daily[date.fromisoformat(row["date"])] += int(row.get("inputTokens", 0)) + int(row.get("outputTokens", 0))
    return daily


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--chatgpt", help="ChatGPT export .zip or conversations.json")
    ap.add_argument("--claude", help="Claude export .zip or conversations.json")
    ap.add_argument("--claude-code", help="ccusage daily --json output")
    ap.add_argument("--weeks", type=int, default=26)
    ap.add_argument("--out", default="data/tokens.json")
    args = ap.parse_args()
    if not (args.chatgpt or args.claude or args.claude_code):
        ap.error("give at least one of --chatgpt, --claude, --claude-code")

    sources = {"claude": defaultdict(int), "chatgpt": defaultdict(int)}
    if args.chatgpt:
        for day, n in chatgpt_daily(load_conversations(args.chatgpt)).items():
            sources["chatgpt"][day] += n
    if args.claude:
        for day, n in claude_daily(load_conversations(args.claude)).items():
            sources["claude"][day] += n
    if args.claude_code:
        for day, n in claude_code_daily(args.claude_code).items():
            sources["claude"][day] += n

    this_week = week_of(datetime.now(timezone.utc).date())
    starts = [this_week - timedelta(weeks=i) for i in range(args.weeks - 1, -1, -1)]
    weeks = {s: {"claude": 0, "chatgpt": 0} for s in starts}
    for name, daily in sources.items():
        for day, n in daily.items():
            w = week_of(day)
            if w in weeks:
                weeks[w][name] += n

    all_days = [d for daily in sources.values() for d in daily]
    data = {
        "updated": datetime.now(timezone.utc).date().isoformat(),
        "estimated": bool(args.chatgpt or args.claude),
        "since": min(all_days).isoformat() if all_days else None,
        "totals": {name: sum(daily.values()) for name, daily in sources.items()},
        "weeks": [{"start": s.isoformat(), **weeks[s]} for s in starts],
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    shown = sum(w["claude"] + w["chatgpt"] for w in data["weeks"])
    print(f"Wrote {args.out}: {shown:,} tokens over the last {args.weeks} weeks "
          f"(all time: Claude {data['totals']['claude']:,}, ChatGPT {data['totals']['chatgpt']:,})")


if __name__ == "__main__":
    main()
