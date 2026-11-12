#!/usr/bin/env python3
"""Update data/books.json from a Goodreads library export (My Books > Import and export > Export Library).

Takes titles, authors, ratings, page counts, read dates, shelves and reviews from the CSV, and keeps
the cover images already in books.json (the export has no covers). Titles are shortened the same way
as the sync (series and subtitles dropped) and data/book-overrides.json renames still apply.

Usage: python3 scripts/import_goodreads_csv.py <goodreads_library_export.csv> [data/books.json]
"""

import csv
import html
import json
import re
import sys

OVERRIDES = "data/book-overrides.json"


def short_title(title):
    title = re.sub(r"\s*\([^()]*#[\d.]+\)\s*$", "", title)  # "(Percy Jackson and the Olympians, #2)"
    return title.split(": ")[0].strip()


def clean_review(raw):
    text = re.sub(r"<br\s*/?>", "\n", raw or "", flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def main():
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    csv_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) == 3 else "data/books.json"

    try:
        with open(out_path, encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, ValueError):
        old = {"currentlyReading": [], "read": []}
    old_books = old.get("currentlyReading", []) + old.get("read", [])
    covers = {(b["author"], b["title"]): b for b in old_books}
    order = {(b["author"], b["title"]): i for i, b in enumerate(old_books)}

    try:
        with open(OVERRIDES, encoding="utf-8") as f:
            renames = json.load(f).get("titles", {})
    except (OSError, ValueError):
        renames = {}

    shelves = {"currently-reading": [], "read": []}
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            shelf = row.get("Exclusive Shelf", "")
            if shelf not in shelves:
                continue  # skip to-read and custom exclusive shelves
            title = short_title(row["Title"])
            title = renames.get(title, renames.get(row["Title"], title))
            author = row["Author"].strip()
            previous = covers.get((author, title), {})
            pages = int(row["Number of Pages"]) if row.get("Number of Pages", "").isdigit() else 0
            rating = round(float(row["My Rating"] or 0))
            read_at = row.get("Date Read", "").replace("/", "-") or None
            shelves[shelf].append({
                "title": title,
                "author": author,
                "cover": previous.get("cover"),
                "rating": rating,
                "pages": pages or None,
                "readAt": read_at,
                "review": clean_review(row.get("My Review")),
                "url": f"https://www.goodreads.com/book/show/{row['Book Id']}",
            })

    def sort_key(book):
        # newest read first; otherwise keep the order the shelf already had
        return (book["readAt"] or "", -order.get((book["author"], book["title"]), 10_000))

    for books in shelves.values():
        books.sort(key=sort_key, reverse=True)

    missing = [b["title"] for b in shelves["read"] + shelves["currently-reading"] if not b["cover"]]
    data = {"updated": old.get("updated"), "currentlyReading": shelves["currently-reading"], "read": shelves["read"]}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Wrote {len(data['currentlyReading'])} reading and {len(data['read'])} read books"
          + (f"; no cover yet for: {', '.join(missing)}" if missing else ""))


if __name__ == "__main__":
    main()
