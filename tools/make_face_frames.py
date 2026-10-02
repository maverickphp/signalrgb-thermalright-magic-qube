"""Draws 240x240 frames like SignalRGB's "Simple Sensor" LCD face, as raw RGB files for
tools/test_decoder.mjs: the value in bold Arial with a 1px black outline, the sensor label and
unit below it, over a background color.

  python tools/make_face_frames.py OUT_DIR
Writes OUT_DIR/<value>_<size>.rgb for values 0-120 at several value font sizes.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

FONTS = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
SIZE = 240
TEXT = (0, 255, 0)
BACKGROUND = (178, 18, 92)  # the pink effect color from SignalRGB's Solid Color


def outlined(draw, xy, text, font, fill):
    x, y = xy
    for dx, dy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
        draw.text((x + dx, y + dy), text, font=font, fill=(0, 0, 0))
    draw.text((x, y), text, font=font, fill=fill)


def frame(value, value_size):
    img = Image.new("RGB", (SIZE, SIZE), BACKGROUND)
    draw = ImageDraw.Draw(img)
    big = ImageFont.truetype(os.path.join(FONTS, "arialbd.ttf"), value_size)
    label = ImageFont.truetype(os.path.join(FONTS, "arial.ttf"), 32)
    unit = ImageFont.truetype(os.path.join(FONTS, "arial.ttf"), 28)
    lines = [(str(value), big, value_size * 1.15 + 5), ("CPU Temperature", label, 37), ("°C", unit, 32)]
    y = (SIZE - sum(h for _, _, h in lines)) / 2
    for text, font, height in lines:
        w = draw.textlength(text, font=font)
        outlined(draw, ((SIZE - w) / 2, y), text, font, TEXT)
        y += height
    return img


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for size in (116, 126, 134):
        for value in range(121):
            with open(os.path.join(out, f"{value}_{size}.rgb"), "wb") as f:
                f.write(frame(value, size).tobytes())
    frame(63, 126).save(os.path.join(out, "sample_63.png"))
