#!/usr/bin/env python3
"""Save a year of GitHub contribution counts for the Expedition Log heatmap.

Uses GitHub's GraphQL API, which needs a token (the workflow's built-in one is
enough). Only public contributions are visible to that token.

Usage: GITHUB_USER=... GITHUB_TOKEN=... python3 scripts/fetch_github.py <output.json>
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

QUERY = """
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}
"""


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    user = os.environ["GITHUB_USER"]
    req = urllib.request.Request(
        "https://api.github.com/graphql",
        data=json.dumps({"query": QUERY, "variables": {"login": user}}).encode(),
        headers={
            "Authorization": "Bearer " + os.environ["GITHUB_TOKEN"],
            "Content-Type": "application/json",
            "User-Agent": "portfolio-contributions-sync/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.load(resp)
    if body.get("errors") or not (body.get("data") or {}).get("user"):
        sys.exit("GitHub API error: " + json.dumps(body.get("errors") or body)[:500])

    calendar = body["data"]["user"]["contributionsCollection"]["contributionCalendar"]
    days = [d for week in calendar["weeks"] for d in week["contributionDays"]]
    if not days:
        sys.exit("GitHub returned an empty calendar")

    out = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "user": user,
        "total": calendar["totalContributions"],
        # one count per day, starting at `start` (always a Sunday) with no gaps
        "start": days[0]["date"],
        "counts": [d["contributionCount"] for d in days],
    }
    with open(sys.argv[1], "w") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")
    print(f"{out['total']} contributions across {len(days)} days from {out['start']}")


if __name__ == "__main__":
    main()
