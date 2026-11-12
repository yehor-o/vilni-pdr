"""Rasterise the app icons from the SVG sources in public/icons/.

Run from the project root:  npm run icons
(uses the project venv: .venv/bin/python -I tools/make_icons.py)
Needs pymupdf (SVG rendering) and Pillow (exact resizing).
"""
import io
import pathlib

import pymupdf as fitz
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
ICONS = ROOT / "public" / "icons"

# (source svg, output png, size)
JOBS = [
    ("icon.svg", "icon-192.png", 192),
    ("icon.svg", "icon-512.png", 512),
    ("icon.svg", "favicon-32.png", 32),
    ("icon-maskable.svg", "icon-maskable-512.png", 512),
    # iOS rounds the corners itself, so the full-bleed artwork is used.
    ("icon-maskable.svg", "apple-touch-icon-180.png", 180),
]


def render(svg: pathlib.Path, size: int) -> Image.Image:
    doc = fitz.open(stream=svg.read_bytes(), filetype="svg")
    page = doc[0]
    zoom = (size * 4) / page.rect.width  # supersample, then downscale
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=True)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    for src, out, size in JOBS:
        img = render(ICONS / src, size)
        if out.startswith("apple-touch"):
            # iOS shows transparency as black: flatten onto the brand blue.
            bg = Image.new("RGBA", img.size, "#1E66D6")
            bg.alpha_composite(img)
            img = bg.convert("RGB")
        img.save(ICONS / out, optimize=True)
        print(f"{out}: {size}x{size}")


if __name__ == "__main__":
    main()
