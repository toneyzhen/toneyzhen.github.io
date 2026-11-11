#!/usr/bin/env python3
"""Fetch a public Goodreads profile's shelves and write them to a JSON file.

Goodreads no longer has an API, but every public shelf still has an RSS feed.
Browsers can't read that feed directly from the site (no CORS headers), so a
GitHub Action runs this script once a day and commits data/books.json.

Usage: python3 scripts/fetch_goodreads.py <goodreads-user-id> <output.json>

If the profile isn't public, set GOODREADS_KEY to the "key" value from the
RSS link at the bottom of your Goodreads "My Books" page.
"""

import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

# Goodreads has served the feed at both of these over the years; try them in order.
FEEDS = [
    "https://www.goodreads.com/review/list_rss/{user}?shelf={shelf}&per_page=100",
    "https://www.goodreads.com/review/list_rss/{user}?shelf={shelf}",
]
MAX_READ = 30


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "portfolio-bookshelf-sync/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def fetch_shelf(user, shelf):
    """Return the shelf's books, or None if Goodreads wouldn't serve the feed."""
    for template in FEEDS:
        url = template.format(user=user, shelf=shelf)
        key = os.environ.get("GOODREADS_KEY", "").strip()
        shown = url
        if key:
            url += "&key=" + urllib.parse.quote(key)
            shown += "&key=***"
        try:
            return parse(fetch(url))
        except urllib.error.HTTPError as err:
            print(f"{shelf}: HTTP {err.code} from {shown}")
        except ET.ParseError as err:
            print(f"{shelf}: response from {shown} wasn't valid RSS ({err})")
    return None


def text(item, tag):
    el = item.find(tag)
    return (el.text or "").strip() if el is not None else ""


def iso_date(value):
    if not value:
        return None
    try:
        return parsedate_to_datetime(value).date().isoformat()
    except (TypeError, ValueError):
        return None


def clean_review(raw):
    if not raw:
        return ""
    no_tags = re.sub(r"<br\s*/?>", "\n", raw, flags=re.I)
    no_tags = re.sub(r"<[^>]+>", "", no_tags)
    return re.sub(r"\n{3,}", "\n\n", html.unescape(no_tags)).strip()


def cover(item):
    for tag in ("book_large_image_url", "book_medium_image_url", "book_image_url"):
        url = text(item, tag)
        if url and "nophoto" not in url:
            return url
    return None


def parse(xml_bytes):
    root = ET.fromstring(xml_bytes)
    books = []
    for item in root.iter("item"):
        book_el = item.find("book")
        pages = text(book_el, "num_pages") if book_el is not None else ""
        rating = text(item, "user_rating")
        books.append({
            "title": html.unescape(text(item, "title")),
            "author": html.unescape(text(item, "author_name")),
            "cover": cover(item),
            "rating": int(rating) if rating.isdigit() else 0,
            "pages": int(pages) if pages.isdigit() else None,
            "readAt": iso_date(text(item, "user_read_at")),
            "addedAt": iso_date(text(item, "user_date_added")),
            "review": clean_review(text(item, "user_review")),
            "url": text(item, "link") or None,
        })
    return books


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    user, out_path = sys.argv[1], sys.argv[2]

    reading = fetch_shelf(user, "currently-reading")
    read = fetch_shelf(user, "read")
    if reading is None and read is None:
        try:
            fetch(f"https://www.goodreads.com/user/show/{user}")
            print("The profile page loads, but its shelf feeds don't. Check that the profile is public.")
        except urllib.error.HTTPError as err:
            print(f"The profile page returned HTTP {err.code} too.")
        sys.exit("Couldn't read any Goodreads shelf; leaving the existing books file unchanged.")
    reading, read = reading or [], read or []
    read.sort(key=lambda b: b["readAt"] or b["addedAt"] or "", reverse=True)

    data = {
        "updated": datetime.now(timezone.utc).date().isoformat(),
        "currentlyReading": reading,
        "read": read[:MAX_READ],
    }

    # Only the date changed? Keep the old file so the Action doesn't commit every day.
    try:
        with open(out_path, encoding="utf-8") as f:
            old = json.load(f)
        if {**old, "updated": None} == {**data, "updated": None}:
            print("Books unchanged")
            return
    except (OSError, ValueError):
        pass

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Wrote {len(reading)} currently reading and {len(data['read'])} read books")


if __name__ == "__main__":
    main()
