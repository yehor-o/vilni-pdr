"""Import the official PDR theory-exam questions PDF into data/questions.json + data/images/.

Usage (from the repo root):
    .venv/bin/python -I scripts/import_questions.py [--pdf PATH] [--diag PATH]

Re-runnable: data/images/ is cleared of previously generated files (sNN-qNNN-K.*) and
data/questions.json is rewritten on every run. Nothing in the output is hand-edited.

How it works
------------
1. Every page is read with page.get_text("dict"). Lines that share a baseline are merged into
   "rows" (justified text is often split into one PDF line per word; option markers like "2)"
   can sit 1-2pt off the baseline of their text). Calibri spans at the top of a page are the
   printed page numbers and are dropped.
2. A row is "bold" when most of its non-space characters are bold. Bold rows are headings or
   question text; regular rows are answer options. (Some rows mix weights, e.g. a trailing "?"
   or ")" or a leading "27." in regular weight; majority weight decides.)
3. Placed images come from the same "dict" output (image blocks). Their xref is found by
   hashing the block's image bytes and matching against doc.extract_image(xref) for every image
   xref (page.get_image_info(xrefs=True) gives the same answer but takes ~3 s per page on this
   file because every page shares one giant /Resources dictionary). If a block cannot be
   matched that way, the page falls back to get_image_info(xrefs=True).
4. Rows and images are walked in reading order (page, then top-to-bottom) through a small
   state machine: heading -> question text -> images -> options. An image belongs to the
   question whose bold text precedes it (it may be on the next page).

Everything irregular is handled explicitly below and logged to the diagnostics file.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PDF = ROOT / "data" / "source" / "pdr-questions-nakaz225.pdf"
OUT_JSON = ROOT / "data" / "questions.json"
OUT_IMG = ROOT / "data" / "images"
DEFAULT_DIAG = ROOT / "data" / "work" / "import" / "import_diag.txt"
SOURCE_ORDER = "Наказ ГСЦ МВС від 29.10.2025 № 225"

IMG_NAME_RE = re.compile(r"^s\d\d(\.\d)?-q\d\d\d-\d+\.[a-z0-9]+$")
Q_START_RE = re.compile(r"^(\d{1,3})\.(?!\d)\s*(.*)$", re.S)  # "12. text", "6.Що", not "5.34"
OPT_START_RE = re.compile(r"^(\d{1,2})\)\s*(.*)$", re.S)  # "1) text", "1)Так."
OPT_DOT_RE = re.compile(r"^(\d)\.\s+(.*)$", re.S)  # irregular "1. text" option (regular weight)
HEADING_RE = re.compile(r"^(\d{1,2})\.(?:(\d)\.)?(?!\d)\s*(.*)$", re.S)  # "26. ...", "8.1. ..."
PAGE_NUMBER_MAX_Y = 60  # page-number line(s) start at y~37 (the number can wrap to a 2nd Calibri line at y~49)


@dataclass
class Row:
    page: int  # 1-based
    y0: float
    y1: float
    x0: float
    x1: float
    text: str
    bold: bool
    parts: list = field(default_factory=list)  # [(x0, x1, text)] of the PDF lines in this row


@dataclass
class Img:
    page: int
    y0: float
    y1: float
    x0: float
    x1: float
    xref: int


@dataclass
class Question:
    n: int
    page: int
    text_parts: list = field(default_factory=list)
    options: list = field(default_factory=list)  # list of list-of-parts
    images: list = field(default_factory=list)  # list of Img
    captions: list = field(default_factory=list)  # list of Row (bold labels under images)


@dataclass
class Section:
    id: int
    sub: int | None  # 1/2 for the subsections 8.1, 8.2, 16.1, 16.2; None otherwise
    page: int
    title_parts: list = field(default_factory=list)
    questions: list = field(default_factory=list)

    @property
    def key(self) -> str:
        return f"{self.id}" if self.sub is None else f"{self.id}.{self.sub}"

    @property
    def file_key(self) -> str:
        return f"{self.id:02d}" if self.sub is None else f"{self.id:02d}.{self.sub}"


def norm(s: str) -> str:
    """Collapse whitespace runs to one space and strip. No other change to the wording."""
    return re.sub(r"\s+", " ", s).strip()


def join_rows(parts: list[str]) -> str:
    """Join wrapped rows with single spaces. A row that ends in a hyphen glued to a letter or
    digit ("дорожньо-" / "транспортної") is a compound word broken after its own hyphen
    (LibreOffice does not hyphenate this text otherwise), so it is joined without a space to
    keep the printed word intact: "дорожньо-транспортної"."""
    out = ""
    for part in parts:
        part = part.strip()
        if not part:
            continue
        # ...unless the next row starts with a conjunction ("Квадро- і трицикли"), where the
        # hyphen is a suspended one and the space is real.
        if out and re.search(r"\w-$", out) and not re.match(r"(і|й|та|або|чи)\s", part):
            out += part
        else:
            out = f"{out} {part}" if out else part
    return norm(out)


def is_bold_span(span) -> bool:
    return "Bold" in span["font"] or bool(span["flags"] & 16)


def is_heading_text(t: str) -> bool:
    letters = [c for c in t if c.isalpha()]
    return len(letters) >= 3 and all(c.isupper() for c in letters)


# --------------------------------------------------------------------------- reading the PDF

def build_image_hash_index(doc):
    index: dict[str, list[int]] = {}
    for xref in range(1, doc.xref_length()):
        if doc.xref_get_key(xref, "Subtype") != ("name", "/Image"):
            continue
        try:
            data = doc.extract_image(xref)["image"]
        except Exception:  # pragma: no cover - defensive
            continue
        index.setdefault(hashlib.md5(data).hexdigest(), []).append(xref)
    return index


def read_page(doc, pno, hash_index, diag):
    page = doc[pno]
    d = page.get_text("dict", flags=pymupdf.TEXT_PRESERVE_IMAGES)
    lines = []  # (y0, y1, x0, x1, [spans])
    images: list[Img] = []
    fallback_needed = False
    for b in d["blocks"]:
        if b["type"] == 1:
            x0, y0, x1, y1 = b["bbox"]
            xrefs = hash_index.get(hashlib.md5(b["image"]).hexdigest())
            if not xrefs:
                fallback_needed = True
                xref = 0
            else:
                if len(xrefs) > 1:
                    smasks = {doc.xref_get_key(x, "SMask")[1] != "null" for x in xrefs}
                    if len(smasks) > 1:
                        diag.append(f"p{pno+1}: image bytes match xrefs {xrefs} with differing SMask; using {xrefs[0]}")
                xref = xrefs[0]  # identical bytes; any of them exports the same file
            images.append(Img(pno + 1, y0, y1, x0, x1, xref))
            continue
        for l in b["lines"]:
            spans = [s for s in l["spans"]]
            # Printed page number: Calibri at the very top of the page. Dropped.
            if l["bbox"][1] < PAGE_NUMBER_MAX_Y and all(
                s["font"].startswith("Calibri") or not s["text"].strip() for s in spans
            ):
                continue
            if any(s["font"].startswith("Calibri") and s["text"].strip() for s in spans):
                diag.append(f"p{pno+1}: unexpected Calibri text kept: {''.join(s['text'] for s in spans)!r}")
            if not "".join(s["text"] for s in spans).strip():
                continue
            x0, y0, x1, y1 = l["bbox"]
            lines.append((y0, y1, x0, x1, spans))
    if fallback_needed:
        diag.append(f"p{pno+1}: image hash lookup failed, using get_image_info(xrefs=True)")
        info = page.get_image_info(xrefs=True)
        for im in images:
            if im.xref:
                continue
            best = min(info, key=lambda i: abs(i["bbox"][0] - im.x0) + abs(i["bbox"][1] - im.y0))
            im.xref = best["xref"]

    # Merge lines into rows: same row when the vertical centres are within 4pt.
    lines.sort(key=lambda t: ((t[0] + t[1]) / 2, t[2]))
    groups: list[list] = []
    for ln in lines:
        c = (ln[0] + ln[1]) / 2
        if groups and abs(c - groups[-1][0]) < 4:
            groups[-1][1].append(ln)
        else:
            groups.append([c, [ln]])
    rows = []
    for _, lns in groups:
        lns.sort(key=lambda t: t[2])
        text = ""
        prev_x1 = None
        bold_chars = reg_chars = 0
        for (y0, y1, x0, x1, spans) in lns:
            t = "".join(s["text"] for s in spans)
            if prev_x1 is not None:
                # separate PDF lines in one row (justified text): a visible gap is a word gap;
                # touching lines (gap <= 0.5pt) are glued as printed
                text += " " if (x0 - prev_x1) > 0.5 else ""
            text += t
            prev_x1 = x1
            for s in spans:
                n = len(s["text"].replace(" ", ""))
                if is_bold_span(s):
                    bold_chars += n
                else:
                    reg_chars += n
        rows.append(Row(pno + 1, min(l[0] for l in lns), max(l[1] for l in lns),
                        lns[0][2], max(l[3] for l in lns), text, bold_chars > reg_chars,
                        [(l[2], l[3], "".join(s["text"] for s in l[4])) for l in lns]))
    return rows, images


# --------------------------------------------------------------------------- parsing

def parse(doc, diag):
    hash_index = build_image_hash_index(doc)
    stream = []  # ("row", Row) | ("img", Img), in reading order
    all_images: list[Img] = []
    for pno in range(doc.page_count):
        rows, images = read_page(doc, pno, hash_index, diag)
        all_images.extend(images)
        items = [((r.y0 + r.y1) / 2, 0, r.x0, "row", r) for r in rows]
        items += [((i.y0 + i.y1) / 2, 1, i.x0, "img", i) for i in images]
        # Images are ordered by their top edge relative to text rows' centres: an image whose
        # top is above a row's centre comes before that row.
        items.sort(key=lambda t: (t[4].y0 if t[3] == "img" else (t[4].y0 + t[4].y1) / 2, t[2]))
        stream.extend((k, o) for (_, __, ___, k, o) in items)

    sections: list[Section] = []
    sec: Section | None = None
    q: Question | None = None
    state = "preamble"  # preamble | heading | qtext | options
    unassigned: list[Img] = []
    markers: list[tuple] = []  # (Img, section key, question n): option-number glyphs drawn as images
    preamble: list[str] = []
    pending_marker = False

    def where():
        return f"s{sec.key} q{q.n}"

    for kind, obj in stream:
        if kind == "img":
            im: Img = obj
            if im.x1 - im.x0 < 12 and im.y1 - im.y0 < 14 and im.x0 < 100 and q is not None \
                    and state in ("qtext", "options"):
                # SPECIAL CASE (s45 q16, p446): the option numbers "1)", "2)", "3)" are tiny
                # images in the left margin instead of text. They are not question pictures;
                # each one starts the next option.
                markers.append((im, sec.key, q.n))
                pending_marker = True
                diag.append(f"OPTION-MARKER-IMAGE p{im.page}: {where()} xref {im.xref} starts option {len(q.options) + 1}")
                continue
            if q is None or state == "heading":
                # No question to attach to (does not happen in this PDF). Reported by validator.
                unassigned.append(im)
                diag.append(f"UNASSIGNED p{im.page}: image xref {im.xref} at y={im.y0:.0f} has no preceding question")
                continue
            if state == "options":
                # Image after the options of a question started: not expected in this layout.
                diag.append(f"IRREGULAR p{im.page}: image xref {im.xref} after options of {where()}; attached to that question")
            q.images.append(im)
            continue

        r: Row = obj
        text = r.text.strip()
        m_h = HEADING_RE.match(text)
        m_q = Q_START_RE.match(text)

        if r.bold and m_h and is_heading_text(m_h.group(3)):
            sid = int(m_h.group(1))
            sub = int(m_h.group(2)) if m_h.group(2) else None
            prev = sections[-1] if sections else None
            if sub is None:
                expected = (prev.id + 1) if prev else 1
                ok = sid == expected
            else:
                # SPECIAL CASE: sections 8 and 16 have no heading of their own; they are printed
                # only as subsections "8.1.", "8.2.", "16.1.", "16.2." with question numbering
                # restarting at 1 in each subsection.
                ok = (prev and ((prev.id == sid and prev.sub == sub - 1) or
                                (prev.id == sid - 1 and sub == 1)))
            if not ok:
                diag.append(f"IRREGULAR p{r.page}: heading {text!r} out of sequence after {prev.key if prev else None}")
            if sub is not None:
                diag.append(f"SUBSECTION p{r.page}: {sid}.{sub} {m_h.group(3)!r}")
            sec = Section(sid, sub, r.page, [m_h.group(3)])
            sections.append(sec)
            q = None
            state = "heading"
            continue

        if state == "preamble":
            preamble.append(text)  # document title on page 1, before section 1
            continue

        if state == "heading" and r.bold and is_heading_text(text) and not m_q:
            sec.title_parts.append(text)  # multi-line heading
            continue

        if r.bold and m_q:
            n = int(m_q.group(1))
            expected = sec.questions[-1].n + 1 if sec.questions else 1
            if n != expected:
                diag.append(f"IRREGULAR p{r.page}: s{sec.key} question number {n} where {expected} expected")
            q = Question(n, r.page, [m_q.group(2)])
            sec.questions.append(q)
            state = "qtext"
            pending_marker = False
            continue

        if state == "heading":
            diag.append(f"UNHANDLED p{r.page}: row after heading {sec.key} that is not a question: {text!r}")
            continue

        if q is not None and not r.bold and pending_marker:
            q.options.append([text])
            state = "options"
            pending_marker = False
            continue

        m_o = OPT_START_RE.match(text)
        if q is not None and not r.bold and m_o and int(m_o.group(1)) == len(q.options) + 1:
            q.options.append([m_o.group(2)])
            state = "options"
            continue

        m_o2 = OPT_DOT_RE.match(text)
        if q is not None and not r.bold and m_o2 and int(m_o2.group(1)) == len(q.options) + 1 \
                and (q.images or q.options):
            # SPECIAL CASE (s16.1 q34, p183): options printed as "1. Дозволено." / "2. ..."
            # (period instead of parenthesis) in regular weight after the picture.
            q.options.append([m_o2.group(2)])
            state = "options"
            diag.append(f"IRREGULAR-MARKER p{r.page}: {where()} option written as {text!r}")
            continue

        # Continuation rows
        if state == "qtext":
            if r.bold and q.images and r.page == q.images[-1].page \
                    and r.y0 < max(i.y1 for i in q.images if i.page == r.page) + 12 and r.x1 - r.x0 < 200:
                # SPECIAL CASE (s26 q1, p253): short bold labels printed right under the
                # pictures (sign numbers "5.34", "5.53"). Not part of the question sentence;
                # stored verbatim in "image_captions".
                q.captions.append(r)
                diag.append(f"CAPTION p{r.page}: {where()}: {text!r}")
                continue
            if not r.bold:
                diag.append(f"IRREGULAR p{r.page}: regular-weight row inside question text {where()}: {text!r}; kept in question text")
            if q.images:
                diag.append(f"IRREGULAR p{r.page}: question text continues after an image {where()}: {text!r}")
            q.text_parts.append(text)
            continue
        if state == "options":
            if r.bold:
                diag.append(f"IRREGULAR p{r.page}: bold row inside options {where()}: {text!r}; kept in option {len(q.options)}")
            if m_o or m_o2:
                diag.append(f"IRREGULAR p{r.page}: option-like marker out of sequence {where()}: {text!r}; kept as continuation")
            q.options[-1].append(text)
            continue
        diag.append(f"UNHANDLED p{r.page}: state={state} row={text!r}")

    return sections, all_images, unassigned, markers, preamble


# --------------------------------------------------------------------------- images

def order_images(imgs: list[Img]) -> list[Img]:
    """Left-to-right, then top-to-bottom: group into visual rows by vertical overlap."""
    imgs = sorted(imgs, key=lambda i: (i.page, i.y0, i.x0))
    rows: list[list[Img]] = []
    for im in imgs:
        if rows and rows[-1][0].page == im.page and im.y0 < min(x.y1 for x in rows[-1]) - 2:
            rows[-1].append(im)
        else:
            rows.append([im])
    return [im for row in rows for im in sorted(row, key=lambda i: i.x0)]


def export_image(doc, xref: int, stem: Path, diag) -> str:
    info = doc.extract_image(xref)
    smask = info.get("smask", 0)
    ext = info["ext"]
    cs = doc.xref_get_key(xref, "ColorSpace")[1]
    if not smask and ext in ("jpeg", "png") and info.get("colorspace", 3) in (1, 3):
        out = stem.with_name(stem.name + (".jpg" if ext == "jpeg" else ".png"))
        out.write_bytes(info["image"])  # original bytes, no recompression
        return out.name
    # Soft mask or unusual colourspace / format: render through a Pixmap and save PNG.
    pix = pymupdf.Pixmap(doc, xref)
    if pix.colorspace and pix.colorspace.n not in (1, 3):
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    if smask:
        mask = pymupdf.Pixmap(doc, smask)
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)
        pix = pymupdf.Pixmap(pix, mask)
    out = stem.with_name(stem.name + ".png")
    pix.save(out)
    diag.append(f"CONVERTED xref {xref} ({ext}, cs={cs}, smask={smask}) -> {out.name}")
    return out.name


def split_overlays(imgs: list[Img]):
    """Return (base images, {id(base): [overlays]}). An overlay is an image drawn entirely
    inside another image of the same question on the same page."""
    overlays: dict[int, list[Img]] = {}
    bases = []
    for im in imgs:
        host = next((b for b in imgs if b is not im and b.page == im.page and
                     b.x0 - 0.5 <= im.x0 and im.x1 <= b.x1 + 0.5 and b.y0 - 0.5 <= im.y0 and im.y1 <= b.y1 + 0.5 and
                     (b.x1 - b.x0) * (b.y1 - b.y0) > (im.x1 - im.x0) * (im.y1 - im.y0)), None)
        if host is None:
            bases.append(im)
        else:
            overlays.setdefault(id(host), []).append(im)
    return bases, overlays


def export_composite(doc, base: Img, stem: Path, diag) -> str:
    """SPECIAL CASE: a small image is pasted on top of a photo (p82 s9 q60, p243 s21 q10:
    patches that cover a brand logo). The exam shows the composite, so render the page area
    of the base image at the base image's own pixel resolution and save it as PNG."""
    info = doc.extract_image(base.xref)
    zoom = info["width"] / (base.x1 - base.x0)
    pix = doc[base.page - 1].get_pixmap(matrix=pymupdf.Matrix(zoom, zoom),
                                        clip=pymupdf.Rect(base.x0, base.y0, base.x1, base.y1), alpha=False)
    out = stem.with_name(stem.name + ".png")
    pix.save(out)
    return out.name


# --------------------------------------------------------------------------- main

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    ap.add_argument("--diag", type=Path, default=DEFAULT_DIAG)
    args = ap.parse_args(argv)

    diag: list[str] = []
    doc = pymupdf.open(args.pdf)
    sections, all_images, unassigned, markers, preamble = parse(doc, diag)

    OUT_IMG.mkdir(parents=True, exist_ok=True)
    for f in OUT_IMG.iterdir():
        if f.is_file() and IMG_NAME_RE.match(f.name):
            f.unlink()

    def bbox(i: Img):
        return [round(i.x0, 1), round(i.y0, 1), round(i.x1, 1), round(i.y1, 1)]

    out_sections = []
    n_files = 0
    placements_question = 0
    overlay_records = []
    for sec in sections:
        qs = []
        for q in sec.questions:
            names = []
            bases, overlays = split_overlays(q.images)
            for k, im in enumerate(order_images(bases), 1):
                stem = OUT_IMG / f"s{sec.file_key}-q{q.n:03d}-{k}"
                if id(im) in overlays:
                    name = export_composite(doc, im, stem, diag)
                    for ov in overlays[id(im)]:
                        overlay_records.append({"page": ov.page, "xref": ov.xref, "bbox": bbox(ov),
                                                "section": sec.key, "n": q.n, "composited_into": name})
                        diag.append(f"OVERLAY p{ov.page}: s{sec.key} q{q.n} xref {ov.xref} drawn over xref {im.xref}; exported composite {name}")
                else:
                    name = export_image(doc, im.xref, stem, diag)
                names.append(name)
                n_files += 1
            placements_question += len(q.images)
            entry = {
                "n": q.n,
                "text": join_rows(q.text_parts),
                "options": [join_rows(o) for o in q.options],
                "images": names,
                "page": q.page,
            }
            if q.captions:
                # Labels printed under the images (left-to-right, top-to-bottom), verbatim.
                # Each label is split off by horizontal gaps (> 10pt) so that "5.34" and "5.53",
                # printed on one line under two pictures, become two captions.
                caps = []
                for c in sorted(q.captions, key=lambda r: (r.page, r.y0, r.x0)):
                    groups = []
                    for x0, x1, t in sorted(c.parts):
                        if groups and x0 - groups[-1][1] <= 10:
                            groups[-1][1] = x1
                            groups[-1][2] += " " + t
                        else:
                            groups.append([x0, x1, t])
                    caps += [norm(g[2]) for g in groups]
                entry["image_captions"] = caps
            qs.append(entry)
        out_sections.append({"id": sec.id, "sub": sec.sub, "number": sec.key,
                             "title": join_rows(sec.title_parts), "page": sec.page, "questions": qs})

    data = {
        "source": {"file": args.pdf.name, "order": SOURCE_ORDER},
        "sections": out_sections,
        # Accounting of every image placement found in the PDF, for validate_questions.py.
        "pdf_image_placements": {
            "total": len(all_images),
            "question_images": placements_question,  # includes overlays (composited)
            "overlays_composited": overlay_records,
            "option_marker_images": [{"page": i.page, "xref": i.xref, "bbox": bbox(i), "section": sk, "n": n}
                                     for (i, sk, n) in markers],
            "unassigned": [{"page": i.page, "xref": i.xref, "bbox": bbox(i)} for i in unassigned],
        },
    }
    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    args.diag.parent.mkdir(parents=True, exist_ok=True)
    args.diag.write_text("\n".join(["PREAMBLE: " + " | ".join(preamble)] + diag) + "\n", encoding="utf-8")
    nq = sum(len(s["questions"]) for s in out_sections)
    print(f"sections={len(out_sections)} questions={nq} image_files={n_files} placed_in_pdf={len(all_images)} "
          f"option_markers={len(markers)} overlays={len(overlay_records)} unassigned={len(unassigned)} "
          f"diag={args.diag}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
