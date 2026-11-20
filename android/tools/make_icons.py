#!/usr/bin/env python3
"""从 icon-src/ic_launcher_source.jpg 生成 Android 各密度启动图标。

用法：python tools/make_icons.py
输出：
  app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png
  app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_round.png
  app/src/main/res/drawable-xxxhdpi/ic_launcher_foreground.png（自适应图标前景 432x432）
"""
from __future__ import annotations

import pathlib

from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "icon-src" / "ic_launcher_source.jpg"
RES = ROOT / "app" / "src" / "main" / "res"

DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
ADAPTIVE_SIZE = 432  # 108dp @ xxxhdpi


def trim_white(img: Image.Image, threshold: int = 244, margin: int = 12) -> Image.Image:
    """裁掉接近纯白的边缘，留一点边距。"""
    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    left, top, right, bottom = w, h, 0, 0
    step = 4  # 采样加速
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b = px[x, y]
            if r < threshold or g < threshold or b < threshold:
                left = min(left, x)
                right = max(right, x)
                top = min(top, y)
                bottom = max(bottom, y)
    if right <= left or bottom <= top:
        return rgb
    left = max(0, left - margin)
    top = max(0, top - margin)
    right = min(w, right + margin)
    bottom = min(h, bottom + margin)
    return rgb.crop((left, top, right, bottom))


def square_on_white(art: Image.Image, size: int, content_ratio: float) -> Image.Image:
    """把内容等比缩放到 content_ratio*size，居中贴到白色方画布上。"""
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    target = int(size * content_ratio)
    a = art.copy()
    a.thumbnail((target, target), Image.LANCZOS)
    canvas.paste(a, ((size - a.width) // 2, (size - a.height) // 2))
    return canvas


def round_icon(square: Image.Image) -> Image.Image:
    """圆形裁切 + 白色外缘，用于 ic_launcher_round。"""
    size = square.width
    out = Image.new("RGB", (size, size), (255, 255, 255))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    inner = square.copy()
    # 圆内略微缩小，避免内容贴边
    scale = int(size * 0.94)
    inner = inner.resize((scale, scale), Image.LANCZOS)
    layer = Image.new("RGB", (size, size), (255, 255, 255))
    layer.paste(inner, ((size - scale) // 2, (size - scale) // 2))
    out.paste(layer, (0, 0), mask)
    return out


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"缺少源图: {SRC}")
    src = Image.open(SRC).convert("RGB")
    art = trim_white(src)
    print(f"源图 {src.size} -> 裁剪后 {art.size}")

    for name, px in DENSITIES.items():
        d = RES / f"mipmap-{name}"
        d.mkdir(parents=True, exist_ok=True)
        icon = square_on_white(art, px, 0.92)
        icon.save(d / "ic_launcher.png", optimize=True)
        round_icon(icon).save(d / "ic_launcher_round.png", optimize=True)
        print(f"  mipmap-{name}: {px}px")

    fg_dir = RES / "drawable-xxxhdpi"
    fg_dir.mkdir(parents=True, exist_ok=True)
    # 自适应图标：内容压到 66% 安全区内（掩模会裁掉外圈）
    fg = square_on_white(art, ADAPTIVE_SIZE, 0.66)
    fg.save(fg_dir / "ic_launcher_foreground.png", optimize=True)
    print(f"  drawable-xxxhdpi/ic_launcher_foreground.png: {ADAPTIVE_SIZE}px")


if __name__ == "__main__":
    main()
