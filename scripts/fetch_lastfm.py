#!/usr/bin/env python3
"""Save a snapshot of Last.fm listening data for the Listening card.

The card shows live data when it can reach Last.fm and falls back to this
snapshot otherwise (for example in sandboxed previews, or if Last.fm is down).

Usage: LASTFM_USER=... LASTFM_API_KEY=... python3 scripts/fetch_lastfm.py <output.json>
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API = "https://ws.audioscrobbler.com/2.0/"
BLANK_ART = "2a96cbd8b46e442fc41c2b86b821562f"


def call(method, **params):
    query = urllib.parse.urlencode({
        "method": method,
        "user": os.environ["LASTFM_USER"],
        "api_key": os.environ["LASTFM_API_KEY"],
        "format": "json",
        **params,
    })
    req = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": "portfolio-listening-sync/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    if "error" in data:
        raise RuntimeError(f"{method}: {data.get('message')}")
    return data


def as_list(value):
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def recent():
    tracks = as_list(call("user.getrecenttracks", limit=1)["recenttracks"].get("track"))
    if not tracks:
        return None
    t = tracks[0]
    art = [i.get("#text") for i in t.get("image", []) if i.get("#text") and BLANK_ART not in i.get("#text")]
    now_playing = t.get("@attr", {}).get("nowplaying") == "true"
    return {
        "name": t.get("name"),
        "artist": (t.get("artist") or {}).get("#text") or (t.get("artist") or {}).get("name"),
        "art": art[-1] if art else None,
        # a snapshot is never "now playing" by the time someone sees it
        "nowPlaying": False,
        "playedAt": int(time.time()) if now_playing else int((t.get("date") or {}).get("uts", 0)) or None,
    }


def top_artists():
    items = as_list(call("user.gettopartists", period="1month", limit=5)["topartists"].get("artist"))
    return [{"name": a["name"], "plays": int(a["playcount"])} for a in items]


def top_tracks():
    items = as_list(call("user.gettoptracks", period="1month", limit=5)["toptracks"].get("track"))
    return [{"name": t["name"], "artist": (t.get("artist") or {}).get("name"), "plays": int(t["playcount"])} for t in items]


def stats():
    user = call("user.getinfo")["user"]
    return {"plays": int(user["playcount"]), "since": int(user["registered"]["unixtime"])}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out_path = sys.argv[1]
    data = {
        "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "recent": recent(),
        "topArtists": top_artists(),
        "topTracks": top_tracks(),
        "stats": stats(),
    }

    try:
        with open(out_path, encoding="utf-8") as f:
            old = json.load(f)
        if {**old, "updated": None} == {**data, "updated": None}:
            print("Listening data unchanged")
            return
    except (OSError, ValueError):
        pass

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Saved: {data['stats']['plays']} plays, {len(data['topArtists'])} top artists, {len(data['topTracks'])} top tracks")


if __name__ == "__main__":
    main()
