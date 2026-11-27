#!/usr/bin/env python3
"""Save the number of GitHub contributions in the past year for the Expedition Log.

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

    total = body["data"]["user"]["contributionsCollection"]["contributionCalendar"]["totalContributions"]

    # Only the total is shown; skip the write when it hasn't changed so there's no daily commit
    try:
        with open(sys.argv[1]) as f:
            old = json.load(f)
        if old.get("total") == total and old.get("user") == user:
            print(f"{total} contributions, unchanged")
            return
    except (OSError, ValueError):
        pass

    out = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "user": user, "total": total}
    with open(sys.argv[1], "w") as f:
        json.dump(out, f, indent=2)
        f.write("\n")
    print(f"{total} contributions in the past year")


if __name__ == "__main__":
    main()
