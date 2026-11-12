"""Validate data/questions.json produced by scripts/import_questions.py.

Usage: .venv/bin/python -I scripts/validate_questions.py [--json PATH] [--pdf PATH]

Prints (a) a per-section table, (b) totals, (c) every anomaly. Exit code 1 if any anomaly.
Known source irregularities that the importer handles explicitly (subsections 8.1/8.2/16.1/16.2,
option-marker images, composited overlays) are accounted for, not reported as anomalies.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JSON = ROOT / "data" / "questions.json"
DEFAULT_PDF = ROOT / "data" / "source" / "pdr-questions-nakaz225.pdf"
IMG_DIR = ROOT / "data" / "images"
IMG_NAME_RE = re.compile(r"^s(\d\d)(?:\.(\d))?-q(\d\d\d)-(\d+)\.(jpg|png)$")

OPT_MARKER_RE = re.compile(r"^\d{1,2}\)")
# "...текст. 12. Що ..." / "... 3) ..." inside a text: looks like a following question/option
NEXT_Q_RE = re.compile(r"(?:^|[.?:!»)]\s)(\d{1,3})\.\s*[А-ЯІЇЄҐA-Z]")
EMBEDDED_OPT_RE = re.compile(r"(?:^|\s)[1-9]\)\s+[А-ЯІЇЄҐA-Z]")
# Irregularities that are really in the official text and were checked by eye against the PDF.
# Keyed on the exact text, so a reissued PDF that changes the wording is flagged again.
KNOWN_SOURCE_IRREGULARITIES = {
    # p433: the option is printed as "2) 2.Наскільки ..." (a stray "2." after the marker).
    ("43", 4, 2, "2.Наскільки це можливо нахиліть мотоцикл проти вітру."),
}
HEADING_IN_TEXT_RE = re.compile(r"\d+(?:\.\d)?\.\s*[А-ЯІЇЄҐ]{4,}(?:\s+[А-ЯІЇЄҐ(),]{2,}){1,}")


def count_pdf_placements(pdf: Path) -> int | None:
    try:
        import pymupdf
    except ImportError:
        return None
    if not pdf.exists():
        return None
    doc = pymupdf.open(pdf)
    n = 0
    for page in doc:
        d = page.get_text("dict", flags=pymupdf.TEXT_PRESERVE_IMAGES)
        n += sum(1 for b in d["blocks"] if b["type"] == 1)
    return n


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", type=Path, default=DEFAULT_JSON)
    ap.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    args = ap.parse_args(argv)

    data = json.loads(args.json.read_text(encoding="utf-8"))
    sections = data["sections"]
    anomalies: list[str] = []
    known: list[str] = []

    def bad(msg: str):
        anomalies.append(msg)

    # (a) table
    print(f"{'sec':>5}  {'qs':>4}  {'w/img':>5}  {'imgs':>4}  title")
    total_q = total_qimg = total_img = 0
    referenced: set[str] = set()
    for s in sections:
        qs = s["questions"]
        n_img_q = sum(1 for q in qs if q["images"])
        n_img = sum(len(q["images"]) for q in qs)
        total_q += len(qs)
        total_qimg += n_img_q
        total_img += n_img
        num = s.get("number", str(s["id"]))
        print(f"{num:>5}  {len(qs):>4}  {n_img_q:>5}  {n_img:>4}  {s['title']}")

    # (b) totals
    on_disk = sorted(p.name for p in IMG_DIR.iterdir() if p.is_file()) if IMG_DIR.exists() else []
    size = sum((IMG_DIR / n).stat().st_size for n in on_disk)
    print()
    print(f"sections (incl. subsections): {len(sections)}; distinct section ids: {len({s['id'] for s in sections})}")
    print(f"questions: {total_q}; questions with images: {total_qimg}; image references: {total_img}")
    print(f"image files on disk: {len(on_disk)} ({size / 1024 / 1024:.1f} MiB)")

    # (c) anomalies — sections
    ids = [s["id"] for s in sections]
    if sorted(set(ids)) != list(range(1, 64)):
        missing = sorted(set(range(1, 64)) - set(ids))
        extra = sorted(set(ids) - set(range(1, 64)))
        bad(f"section ids are not exactly 1..63 (missing {missing}, unexpected {extra})")
    if ids != sorted(ids):
        bad("section ids are not in ascending order")
    seen = set()
    for i, s in enumerate(sections):
        key = (s["id"], s.get("sub"))
        if key in seen:
            bad(f"duplicate section {key}")
        seen.add(key)
        sub = s.get("sub")
        if sub is not None:
            same = [x.get("sub") for x in sections if x["id"] == s["id"]]
            if same != list(range(1, len(same) + 1)):
                bad(f"section {s['id']}: subsections not numbered 1..n: {same}")
        elif ids.count(s["id"]) > 1:
            bad(f"section {s['id']} appears more than once without subsection numbers")
        if not s["title"].strip():
            bad(f"section {s.get('number', s['id'])}: empty title")
        if not s["questions"]:
            bad(f"section {s.get('number', s['id'])}: no questions")

    expected_counts = {"1": 79, "2": 37, "3": 16, "4": 26}  # from the official answer table
    for s in sections:
        num = s.get("number", str(s["id"]))
        if num in expected_counts and len(s["questions"]) != expected_counts[num]:
            bad(f"section {num}: {len(s['questions'])} questions, official table says {expected_counts[num]}")

    # questions
    for s in sections:
        num = s.get("number", str(s["id"]))
        file_prefix = f"s{s['id']:02d}" + (f".{s['sub']}" if s.get("sub") is not None else "")
        for idx, q in enumerate(s["questions"], 1):
            tag = f"s{num} q{q.get('n')} (p{q.get('page')})"
            if q["n"] != idx:
                bad(f"{tag}: question number {q['n']} at position {idx} (not consecutive from 1)")
            if not q["text"].strip():
                bad(f"{tag}: empty question text")
            if len(q["options"]) < 2:
                bad(f"{tag}: only {len(q['options'])} option(s)")
            if EMBEDDED_OPT_RE.search(q["text"]):
                bad(f"{tag}: question text contains an option-like marker: {q['text']!r}")
            if HEADING_IN_TEXT_RE.search(q["text"]):
                bad(f"{tag}: question text contains heading-like text: {q['text']!r}")
            for k, o in enumerate(q["options"], 1):
                if not o.strip():
                    bad(f"{tag}: option {k} is empty")
                    continue
                if OPT_MARKER_RE.match(o):
                    bad(f"{tag}: option {k} still starts with a marker: {o!r}")
                if (num, q["n"], k, o) in KNOWN_SOURCE_IRREGULARITIES:
                    known.append(f"{tag}: option {k} {o!r} (printed this way in the PDF)")
                elif NEXT_Q_RE.search(o) or EMBEDDED_OPT_RE.search(o):
                    bad(f"{tag}: option {k} looks like it contains the next question/option: {o!r}")
                if HEADING_IN_TEXT_RE.search(o):
                    bad(f"{tag}: option {k} contains heading-like text: {o!r}")
            for k, name in enumerate(q["images"], 1):
                referenced.add(name)
                m = IMG_NAME_RE.match(name)
                if not m or name.split("-q")[0] != file_prefix or int(m.group(3)) != q["n"] or int(m.group(4)) != k:
                    bad(f"{tag}: unexpected image file name {name!r}")
                if not (IMG_DIR / name).is_file():
                    bad(f"{tag}: image file missing: {name}")
                elif (IMG_DIR / name).stat().st_size == 0:
                    bad(f"{tag}: image file empty: {name}")

    for name in on_disk:
        if name not in referenced:
            bad(f"image file on disk not referenced by any question: {name}")
    if len(referenced) != total_img:
        bad("the same image file is referenced more than once")

    # placements
    pl = data.get("pdf_image_placements")
    if pl is None:
        bad("pdf_image_placements block missing")
    else:
        for u in pl["unassigned"]:
            bad(f"placed image not assigned to a question: page {u['page']} xref {u['xref']} bbox {u['bbox']}")
        accounted = pl["question_images"] + len(pl["option_marker_images"]) + len(pl["unassigned"])
        if accounted != pl["total"]:
            bad(f"image placements: total {pl['total']} but accounted {accounted}")
        if total_img != pl["question_images"] - len(pl["overlays_composited"]):
            bad(f"image references {total_img} != question placements {pl['question_images']} - overlays {len(pl['overlays_composited'])}")
        live = count_pdf_placements(args.pdf)
        if live is None:
            print("(PDF not available: placement total taken from the JSON only)")
        elif live != pl["total"]:
            bad(f"PDF now has {live} placed images, JSON accounts for {pl['total']}")
        print(f"image placements in PDF: {pl['total']} = {pl['question_images']} in questions "
              f"({len(pl['overlays_composited'])} of them overlays composited into the photo below) "
              f"+ {len(pl['option_marker_images'])} option-number images + {len(pl['unassigned'])} unassigned")

    print()
    if known:
        print(f"Known source irregularities, verified by eye ({len(known)}):")
        for k in known:
            print("  - " + k)
    if anomalies:
        print(f"ANOMALIES ({len(anomalies)}):")
        for a in anomalies:
            print("  - " + a)
        return 1
    print("No anomalies.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
