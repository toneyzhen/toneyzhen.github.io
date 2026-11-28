"""Checks that the Goodreads sync never wipes what the export import added.

The sync commits its result straight to main, so this runs first in the workflow.
No network: the widget's answer is faked.

Run: python3 -m unittest discover -s scripts -p "test_*.py"
"""

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import fetch_goodreads  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def book(title, **fields):
    return {"title": title, "author": "Maxwell Maltz", "cover": None, "rating": 0,
            "pages": None, "readAt": None, "review": "", "url": None, **fields}


class KeepsImportedDetails(unittest.TestCase):
    def test_widget_run_keeps_pages_dates_notes_and_rename(self):
        saved = {"updated": "2026-11-01", "currentlyReading": [], "read": [
            book("Psycho-Cybernetics", pages=256, readAt="2026-05-02", review="Long notes from the export"),
        ]}
        # what the widget gives: its own spelling, no pages or date, a cut-down note
        widget = [book("Psychocybernetics", review="Long")]

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "books.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(saved, f)
            shelves = {"read": widget, "currently-reading": []}
            with mock.patch.object(fetch_goodreads, "fetch_shelf", lambda user, shelf: shelves[shelf]), \
                 mock.patch.object(fetch_goodreads, "OVERRIDES", os.path.join(REPO, "data", "book-overrides.json")), \
                 mock.patch.object(sys, "argv", ["fetch_goodreads.py", "1", path]), \
                 mock.patch("builtins.print"):
                fetch_goodreads.main()
            with open(path, encoding="utf-8") as f:
                result = json.load(f)["read"][0]

        self.assertEqual(result["title"], "Psycho-Cybernetics")
        self.assertEqual(result["pages"], 256)
        self.assertEqual(result["readAt"], "2026-05-02")
        self.assertEqual(result["review"], "Long notes from the export")


if __name__ == "__main__":
    unittest.main()
