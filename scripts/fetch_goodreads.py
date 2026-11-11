#!/usr/bin/env python3
"""Fetch a public Goodreads profile's shelves and write them to a JSON file.

Goodreads retired its API in 2020 and its shelf RSS feeds in late 2026. The
public "custom widget" (the embeddable bookshelf box) still works without
signing in, so this script reads that. It has titles, authors, covers, links
and star ratings, but no read dates or page counts.

Browsers can't fetch it from the site directly, so a GitHub Action runs this
once a day and commits the result.

Usage: python3 scripts/fetch_goodreads.py <goodreads-user-id> <output.json>
"""

import html
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone

WIDGET = (
    "https://www.goodreads.com/review/custom_widget/{user}.bookshelf"
    "?cover_position=left&cover_size=medium&num_books=100&order=d&shelf={shelf}"
    "&show_author=1&show_cover=1&show_rating=1&show_review=1&show_tags=0&show_title=1"
    "&sort=date_read&widget_bg_transparent=true&widget_border_width=0&widget_id=1"
    "&widget_text_color=000000&widget_title_size=medium&widget_width=full"
)
MAX_READ = 50


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (portfolio bookshelf sync)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def widget_html(js):
    """The widget is JavaScript: var widget_code = '<html>'; pull out and unescape the string."""
    match = re.search(r"var widget_code = '(.*?)';\s*\n", js, re.S)
    if not match:
        raise ValueError("Goodreads widget didn't contain widget_code; its format may have changed")

    def unescape(m):
        ch = m.group(1)
        if ch.startswith("u"):
            return chr(int(ch[1:], 16))
        return {"n": "\n", "t": "\t", "r": ""}.get(ch, ch)

    return re.sub(r"\\(u[0-9a-fA-F]{4}|.)", unescape, match.group(1), flags=re.S)


def strip_tags(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


def clean_url(url):
    return html.unescape(url).split("?")[0] if url else None


def parse(markup):
    books = []
    for block in markup.split('class="gr_custom_each_container_1"')[1:]:
        img = re.search(r'<img alt="([^"]*)"[^>]*src="([^"]+)"', block)
        link = re.search(r'<a title="([^"]*)" rel="nofollow" href="([^"]+)"', block)
        title_div = re.search(r'gr_custom_title_1">(.*?)</div>', block, re.S)
        author_div = re.search(r'gr_custom_author_1">(.*?)</div>', block, re.S)
        rating_div = re.search(r'gr_custom_rating_1">(.*?)</div>', block, re.S)
        review_div = re.search(r'gr_custom_review_1">(.*?)</div>', block, re.S)

        title = html.unescape(img.group(1)) if img and img.group(1) else ""
        if not title and title_div:
            title = strip_tags(title_div.group(1))
        if not title:
            continue

        cover = img.group(2) if img else None
        if cover and "nophoto" in cover:
            cover = None
        elif cover:
            # drop the size suffix (e.g. ._SX98_) to get the full-size cover
            cover = re.sub(r"\._S[XY]\d+_(?=\.)", "", cover)

        author = strip_tags(author_div.group(1)) if author_div else ""
        author = re.sub(r"^by\s+", "", author)

        books.append({
            "title": title,
            "author": author,
            "cover": cover,
            "rating": rating_div.group(1).count("star_active") if rating_div else 0,
            "pages": None,
            "readAt": None,
            "review": strip_tags(review_div.group(1)) if review_div else "",
            "url": clean_url(link.group(2)) if link else None,
        })
    return books


def fetch_shelf(user, shelf):
    markup = widget_html(fetch(WIDGET.format(user=user, shelf=shelf)))
    # Goodreads falls back to another shelf when the requested one is empty;
    # the header link says which shelf it actually returned.
    served = re.search(r'gr_custom_header_1">.*?shelf=([\w-]+)', markup, re.S)
    if served and served.group(1) != shelf:
        print(f"{shelf}: empty (Goodreads returned the '{served.group(1)}' shelf instead)")
        return []
    books = parse(markup)
    print(f"{shelf}: {len(books)} books")
    return books


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    user, out_path = sys.argv[1], sys.argv[2]

    reading = fetch_shelf(user, "currently-reading")
    read = fetch_shelf(user, "read")
    if not reading and not read:
        sys.exit("Got no books from Goodreads; leaving the existing books file unchanged.")

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
