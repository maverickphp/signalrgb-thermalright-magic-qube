"""Builds the digit templates the plugin uses to read numbers off the "Simple Sensor" LCD face.

The face draws its value in bold Arial. Each digit is rendered here with Windows' Arial Bold,
cropped to its ink, and reduced to a GW x GH grid of ink coverage (0-9). Prints a JS object
literal to paste into Thermalright_Magic_Qube.js.

  python tools/make_digit_templates.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

GW, GH = 6, 9
FONT = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "arialbd.ttf")


def template(ch, size=126):
    font = ImageFont.truetype(FONT, size)
    img = Image.new("L", (size * 2, size * 2), 0)
    ImageDraw.Draw(img).text((size // 2, size // 4), ch, fill=255, font=font)
    x0, y0, x1, y1 = img.getbbox()
    w, h = x1 - x0, y1 - y0
    cells = []
    for gy in range(GH):
        for gx in range(GW):
            box = (x0 + gx * w // GW, y0 + gy * h // GH, x0 + (gx + 1) * w // GW, y0 + (gy + 1) * h // GH)
            px = list(img.crop(box).getdata())
            cells.append(round(9 * sum(p > 127 for p in px) / max(1, len(px))))
    return w / h, cells


if __name__ == "__main__":
    print("const DIGIT_TEMPLATES = {")
    for d in "0123456789":
        aspect, cells = template(d)
        print(f'\t"{d}": {{ aspect: {aspect:.2f}, cells: "{"".join(map(str, cells))}" }},')
    print("};")
