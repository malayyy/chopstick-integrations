#!/usr/bin/env python3
"""Download already-supplied HD PNG frames, validate the sequence and prepare WebP assets."""
from __future__ import annotations

import io
import json
import re
import sys
import zipfile
from pathlib import Path
from statistics import mean

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
CURRENT_FRAMES = ROOT / "frames"
MOBILE_OUT = ROOT / "files/public/frames-mobile"
DESKTOP_OUT = ROOT / "files/public/frames-desktop"
MANIFEST = ROOT / "files/public/hd-frames-manifest.json"
AUDIT_DIR = ROOT / "hd-frame-audit"
EXPECTED_FRAMES = 300
SAMPLES = [1, 75, 150, 225, 300]
DESKTOP_MAX_WIDTH = 2560
MOBILE_MAX_WIDTH = 960
DESKTOP_QUALITY = 90
MOBILE_QUALITY = 86
PNG_PATTERN = re.compile(r"\.png$", re.IGNORECASE)


def frame_number(name: str) -> int:
    stem = Path(name).stem
    values = re.findall(r"\d+", stem)
    if not values:
        raise ValueError(f"Could not identify frame number in {name!r}")
    return int(values[-1])


def resized_image(image: Image.Image, max_width: int) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("RGB")
    width, height = image.size
    target_width = min(max_width, width)
    target_height = max(1, round(height * target_width / width))
    if target_width == width:
        return image.copy()
    return image.resize((target_width, target_height), Image.Resampling.LANCZOS)


def open_zip_image(zf: zipfile.ZipFile, member: str) -> Image.Image:
    # Read only one image at a time; do not extract 576 MB of ZIP contents to disk.
    with zf.open(member) as source:
        return ImageOps.exif_transpose(Image.open(source)).convert("RGB")


def make_comparison(zf: zipfile.ZipFile, by_number: dict[int, str], dims: dict[int, tuple[int, int]]) -> None:
    tile_w, tile_h, label_h = 480, 270, 40
    margin = 18
    width = margin * 2 + len(SAMPLES) * tile_w
    height = margin * 2 + 2 * (label_h + tile_h + 18)
    canvas = Image.new("RGB", (width, height), (15, 15, 17))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 18)
        small = ImageFont.truetype("DejaVuSans.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
        small = font
    labels = [
        "CURRENT REPOSITORY JPEG FRAMES",
        "SUPPLIED HD PNG FRAMES",
    ]
    for row, label in enumerate(labels):
        y = margin + row * (label_h + tile_h + 18)
        draw.text((margin, y), label, fill=(245, 245, 245), font=font)
        y += label_h
        for col, idx in enumerate(SAMPLES):
            x = margin + col * tile_w
            draw.text((x + 2, y - 22), f"FRAME {idx:03d}", fill=(255, 90, 90), font=small)
            if row == 0:
                path = CURRENT_FRAMES / f"ezgif-frame-{idx:03d}.jpg"
                if not path.exists():
                    raise FileNotFoundError(f"Missing current frame: {path}")
                with Image.open(path) as im:
                    image = resized_image(im, tile_w)
            else:
                image = resized_image(open_zip_image(zf, by_number[idx]), tile_w)
            image = ImageOps.fit(image, (tile_w, tile_h), method=Image.Resampling.LANCZOS)
            canvas.paste(image, (x, y))
            draw.rectangle((x, y, x + tile_w - 1, y + tile_h - 1), outline=(90, 90, 96), width=1)
    canvas.save(AUDIT_DIR / "hd-png-vs-current-jpg.jpg", quality=94, subsampling=0)


def main(zip_path: Path) -> None:
    if not zip_path.exists() or zip_path.stat().st_size < 1024:
        raise FileNotFoundError(f"HD-frame ZIP is missing or unexpectedly small: {zip_path}")

    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    MOBILE_OUT.mkdir(parents=True, exist_ok=True)
    DESKTOP_OUT.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path) as zf:
        members = [
            info.filename for info in zf.infolist()
            if not info.is_dir() and PNG_PATTERN.search(info.filename)
        ]
        numbered = [(frame_number(name), name) for name in members]
        numbered.sort(key=lambda item: (item[0], item[1].lower()))
        indices = [idx for idx, _ in numbered]
        if len(numbered) != EXPECTED_FRAMES:
            raise ValueError(f"Expected exactly {EXPECTED_FRAMES} PNG frames; found {len(numbered)}.")
        if indices != list(range(1, EXPECTED_FRAMES + 1)):
            raise ValueError(f"Frame numbering must be exactly 001–300; got starts={indices[:5]} ends={indices[-5:]}.")
        by_number = {idx: name for idx, name in numbered}
        if len(by_number) != EXPECTED_FRAMES:
            raise ValueError("Duplicate frame numbers found in supplied ZIP.")

        # Inspect all dimensions before writing any production-named WebPs.
        dims: dict[int, tuple[int, int]] = {}
        png_sizes = []
        for idx, name in numbered:
            info = zf.getinfo(name)
            png_sizes.append(info.file_size)
            with zf.open(name) as source, Image.open(source) as im:
                width, height = ImageOps.exif_transpose(im).size
                dims[idx] = (width, height)

        unique_dims = sorted({f"{w}x{h}" for w, h in dims.values()})
        aspect_ratios = [round(w / h, 5) for w, h in dims.values()]
        if len(unique_dims) != 1:
            raise ValueError(f"Frames have inconsistent dimensions: {unique_dims}")
        if max(aspect_ratios) - min(aspect_ratios) > 0.001:
            raise ValueError("Frames have inconsistent aspect ratios.")

        # Comparison uses exactly the same 480x270 display size for each source.
        make_comparison(zf, by_number, dims)

        desktop_sizes, mobile_sizes = [], []
        for idx, name in numbered:
            with zf.open(name) as source, Image.open(source) as im:
                image = ImageOps.exif_transpose(im).convert("RGB")
                original_w, original_h = image.size

                # Preserve aspect ratio and never upscale the supplied source frames.
                desktop_w = min(DESKTOP_MAX_WIDTH, original_w)
                desktop_h = max(1, round(original_h * desktop_w / original_w))
                mobile_w = min(MOBILE_MAX_WIDTH, original_w)
                mobile_h = max(1, round(original_h * mobile_w / original_w))

                desktop = image if desktop_w == original_w else image.resize(
                    (desktop_w, desktop_h), Image.Resampling.LANCZOS
                )
                mobile = image if mobile_w == original_w else image.resize(
                    (mobile_w, mobile_h), Image.Resampling.LANCZOS
                )
                filename = f"ezgif-frame-{idx:03d}.webp"
                desktop_path = DESKTOP_OUT / filename
                mobile_path = MOBILE_OUT / filename
                desktop.save(desktop_path, "WEBP", quality=DESKTOP_QUALITY, method=4)
                mobile.save(mobile_path, "WEBP", quality=MOBILE_QUALITY, method=4)
                desktop_sizes.append(desktop_path.stat().st_size)
                mobile_sizes.append(mobile_path.stat().st_size)
                if idx % 50 == 0 or idx == EXPECTED_FRAMES:
                    print(f'Converted HD frames: {idx}/{EXPECTED_FRAMES}', flush=True)

    # Validate exactly 300 outputs before reporting success.
    output_pattern = re.compile(r"^ezgif-frame-\d{3}\.webp$")
    desktop_count = sum(1 for p in DESKTOP_OUT.iterdir() if output_pattern.match(p.name))
    mobile_count = sum(1 for p in MOBILE_OUT.iterdir() if output_pattern.match(p.name))
    if desktop_count != EXPECTED_FRAMES or mobile_count != EXPECTED_FRAMES:
        raise RuntimeError(f"Output counts invalid: desktop={desktop_count}, mobile={mobile_count}")

    manifest = {
        "source": "Google Drive shared HD PNG frame ZIP",
        "source_drive_file_id": "1gbCtbjbtWJANIDF_d-Xcgg9suoibJ1An",
        "frame_count": EXPECTED_FRAMES,
        "frame_indices": [1, EXPECTED_FRAMES],
        "source_dimensions": unique_dims,
        "source_zip_bytes": zip_path.stat().st_size,
        "source_png_total_bytes": sum(png_sizes),
        "source_png_average_bytes": round(mean(png_sizes)),
        "desktop": {
            "directory": "frames-desktop",
            "frame_count": desktop_count,
            "max_width": DESKTOP_MAX_WIDTH,
            "quality": DESKTOP_QUALITY,
            "total_bytes": sum(desktop_sizes),
            "average_bytes_per_frame": round(mean(desktop_sizes)),
        },
        "mobile": {
            "directory": "frames-mobile",
            "frame_count": mobile_count,
            "max_width": MOBILE_MAX_WIDTH,
            "quality": MOBILE_QUALITY,
            "total_bytes": sum(mobile_sizes),
            "average_bytes_per_frame": round(mean(mobile_sizes)),
        },
        "preserve_source_aspect_ratio": True,
        "upscale_source": False,
        "note": "WebP delivery assets were generated from supplied PNGs. No AI enhancement was applied.",
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (AUDIT_DIR / "hd-frame-audit.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (AUDIT_DIR / "README.txt").write_text(
        "HD PNG frame audit\n"
        "------------------\n"
        f"Frames: {EXPECTED_FRAMES} (001–300)\n"
        f"Source dimensions: {', '.join(unique_dims)}\n"
        f"ZIP bytes: {zip_path.stat().st_size:,}\n"
        f"PNG total bytes: {sum(png_sizes):,}\n"
        f"Desktop WebP total: {sum(desktop_sizes):,} bytes\n"
        f"Mobile WebP total: {sum(mobile_sizes):,} bytes\n"
        "The contact sheet compares current repository JPEGs and supplied HD PNGs at the same 480x270 display size.\n"
        "No AI restoration was applied. These are quality-preserving WebP exports from the supplied PNG sequence.\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: process_hd_png_frames.py /path/to/hd-frames.zip")
    main(Path(sys.argv[1]))
