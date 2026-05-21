from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "references/mjui.png"
OUT_DIR = ROOT / "miniprogram/assets/tiles/generated/faces"
CONTACT_SHEET = ROOT / "references/mjui-tile-faces-contact-sheet.png"

CELL_WIDTH = 80
CELL_HEIGHT = 129

GRID: list[list[str | None]] = [
    ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "red5s"],
    ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "red5m"],
    ["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "red5p"],
    ["east", "south", "west", "north", "white", "green", "red", None, None, None],
]


def slice_tiles() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")

    for row_index, row in enumerate(GRID):
        for col_index, tile in enumerate(row):
            if tile is None:
                continue

            left = col_index * CELL_WIDTH
            top = row_index * CELL_HEIGHT
            crop = source.crop((left, top, left + CELL_WIDTH, top + CELL_HEIGHT))
            crop.save(OUT_DIR / f"tile-{tile}.png", optimize=True)


def create_contact_sheet() -> None:
    order = [tile for row in GRID for tile in row if tile is not None]
    cols = 10
    thumb_w = 72
    thumb_h = 116
    cell_w = 112
    cell_h = 146
    rows = (len(order) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell_w, rows * cell_h), (246, 242, 234, 255))

    for index, tile in enumerate(order):
        img = Image.open(OUT_DIR / f"tile-{tile}.png").convert("RGBA")
        img.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        x = (index % cols) * cell_w + (cell_w - img.width) // 2
        y = (index // cols) * cell_h + 6
        sheet.alpha_composite(img, (x, y))

    sheet.convert("RGB").save(CONTACT_SHEET, optimize=True)


if __name__ == "__main__":
    slice_tiles()
    create_contact_sheet()
    print(f"Sliced mjui tiles into {OUT_DIR}")
