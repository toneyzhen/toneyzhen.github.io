#!/usr/bin/env python3
"""Weekly Claude Code token totals for the site's "Building with AI" chart.

Claude Code records every reply, with its model and exact token counts, in log files on
your computer (~/.claude/projects/**/*.jsonl). This reads them and totals tokens per week
per model family. Counted: tokens in, new context written to the cache, and tokens out.
Cache reads (Claude re-reading the same context every turn) are left out; they would
inflate the totals roughly 50-100x.

Only weekly totals leave your computer: no prompts, code, file names or project names.

Usage:
  python scripts/token_usage.py              # write data/tokens.json in this repo
  python scripts/token_usage.py --publish    # upload data/tokens.json to GitHub instead
                                             # (needs the GitHub CLI: gh auth login)
Options: --logs DIR, --weeks N (default 26), --repo OWNER/NAME, --dry-run
"""

import argparse
import base64
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO = "toneyzhen/toneyzhen.github.io"
FILE = "data/tokens.json"
# Fixed order = fixed colors on the site; a family keeps its color whichever others appear.
FAMILIES = [("opus", "Opus"), ("sonnet", "Sonnet"), ("haiku", "Haiku"), ("other", "Other models")]


def default_logs_dir():
    config = os.environ.get("CLAUDE_CONFIG_DIR")
    return Path(config) / "projects" if config else Path.home() / ".claude" / "projects"


def family(model):
    m = (model or "").lower()
    for key, _ in FAMILIES[:-1]:
        if key in m:
            return key
    return "other"


def read_replies(logs_dir):
    """One entry per reply. Claude Code writes a reply once per content block, so dedupe by id."""
    replies = {}
    for path in Path(logs_dir).rglob("*.jsonl"):
        try:
            lines = path.open(encoding="utf-8", errors="replace")
        except OSError:
            continue
        with lines:
            for line in lines:
                if '"usage"' not in line:
                    continue
                try:
                    entry = json.loads(line)
                except ValueError:
                    continue
                msg = entry.get("message")
                if entry.get("type") != "assistant" or not isinstance(msg, dict) or not msg.get("usage"):
                    continue
                if (msg.get("model") or "").startswith("<"):  # synthetic placeholder replies
                    continue
                usage = msg["usage"]
                tokens = sum(int(usage.get(k) or 0) for k in ("input_tokens", "cache_creation_input_tokens", "output_tokens"))
                key = (msg.get("id") or entry.get("uuid"), entry.get("requestId"))
                stamp = entry.get("timestamp")
                if not stamp or not key[0]:
                    continue
                prev = replies.get(key)
                if not prev or tokens > prev[2]:
                    replies[key] = (stamp, family(msg.get("model")), tokens)
    return replies.values()


def build(logs_dir, weeks_back):
    today = datetime.now().astimezone().date()
    this_week = today - timedelta(days=today.weekday())  # weeks start on Monday, local time
    starts = [this_week - timedelta(weeks=i) for i in range(weeks_back - 1, -1, -1)]
    weeks = {s: {key: 0 for key, _ in FAMILIES} for s in starts}
    totals = {key: 0 for key, _ in FAMILIES}
    first = None
    for stamp, fam, tokens in read_replies(logs_dir):
        day = datetime.fromisoformat(stamp.replace("Z", "+00:00")).astimezone().date()
        first = min(first, day) if first else day
        totals[fam] += tokens
        week = day - timedelta(days=day.weekday())
        if week in weeks:
            weeks[week][fam] += tokens
    used = [(k, label) for k, label in FAMILIES if totals[k]]
    return {
        "updated": datetime.now(timezone.utc).date().isoformat(),
        "source": "Claude Code",
        "estimated": False,
        "since": first.isoformat() if first else None,
        "series": [{"key": k, "label": label} for k, label in used],
        "totals": {k: totals[k] for k, _ in used},
        "weeks": [{"start": s.isoformat(), **{k: weeks[s][k] for k, _ in used}} for s in starts],
    }


def same_data(a, b):
    strip = lambda d: {k: v for k, v in (d or {}).items() if k != "updated"}
    return strip(a) == strip(b)


def gh(*args, payload=None):
    result = subprocess.run(["gh", *args], input=payload, capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr


def publish(data, repo, dry_run):
    code, out, err = gh("api", f"repos/{repo}/contents/{FILE}")
    current, sha = None, None
    if code == 0:
        meta = json.loads(out)
        sha = meta["sha"]
        current = json.loads(base64.b64decode(meta["content"]).decode("utf-8"))
    elif "Not Found" not in err:
        sys.exit(f"Couldn't read {FILE} from GitHub: {err.strip() or out.strip()}\n"
                 "Is the GitHub CLI installed and signed in? Run: gh auth login")
    if same_data(current, data):
        print("Token totals unchanged; nothing to upload.")
        return
    body = {
        "message": "Update token usage from Claude Code",
        "content": base64.b64encode((json.dumps(data, indent=2) + "\n").encode()).decode(),
        **({"sha": sha} if sha else {}),
    }
    if dry_run:
        print(f"Would upload {FILE} to {repo} (dry run).")
        return
    code, out, err = gh("api", "-X", "PUT", f"repos/{repo}/contents/{FILE}", "--input", "-", payload=json.dumps(body))
    if code != 0:
        sys.exit(f"Upload failed: {err.strip() or out.strip()}")
    print(f"Uploaded {FILE} to {repo}.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--logs", default=str(default_logs_dir()), help="Claude Code projects folder")
    ap.add_argument("--weeks", type=int, default=26)
    ap.add_argument("--publish", action="store_true", help="upload to GitHub with the gh CLI instead of writing locally")
    ap.add_argument("--repo", default=REPO)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / FILE))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not Path(args.logs).is_dir():
        sys.exit(f"No Claude Code logs at {args.logs}. Use --logs to point at your .claude/projects folder.")
    data = build(args.logs, args.weeks)
    shown = sum(sum(v for k, v in w.items() if k != "start") for w in data["weeks"])
    print(f"Last {args.weeks} weeks: {shown:,} tokens across {len(data['series'])} model families "
          f"(logs since {data['since'] or 'n/a'})")

    if args.publish:
        publish(data, args.repo, args.dry_run)
    elif args.dry_run:
        print(json.dumps(data, indent=2)[:1500])
    else:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
        print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
