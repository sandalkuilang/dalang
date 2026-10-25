# Cut a product generated on a plain white light box → trimmed RGBA PNG.
# `hyperframes remove-background` uses a person-segmentation model: on products it punches holes in labels,
# and a green screen keys dark bodies. A white backdrop keyed by flood fill keeps white parts the object encloses.
#
# Usage: <python with Pillow + numpy, e.g. mflux's> -I key_white.py in.png out.png [--holes]
#        ... -I key_white.py --selftest
# --holes also clears enclosed white (backdrop seen through a handle); leave it off when the object has a white label.
# Background = near-white, low-chroma pixels connected to the frame border. The edge is eroded 1 px against white
# fringing and feathered; light-box floor glow under the base is shaved off the crop.
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def key(im, holes=False):
    im = im.convert("RGB")
    a = np.asarray(im).astype(np.int16)
    lo, hi = a.min(axis=2), a.max(axis=2)
    m = Image.fromarray(np.where((lo > 232) & (hi - lo < 14), 255, 0).astype(np.uint8)).copy()  # copy: floodfill on a numpy-backed image is lost
    w, h = m.size
    px = m.load()
    for x, y in [(x, 0) for x in range(0, w, 8)] + [(x, h - 1) for x in range(0, w, 8)] + \
                [(0, y) for y in range(0, h, 8)] + [(w - 1, y) for y in range(0, h, 8)]:
        if px[x, y] == 255:
            ImageDraw.floodfill(m, (x, y), 128)
    if holes:  # backdrop seen through a handle: enclosed white regions over 0.2 % of the frame (highlights are smaller)
        for y in range(0, h, 6):
            for x in range(0, w, 6):
                if px[x, y] == 255:
                    ImageDraw.floodfill(m, (x, y), 64)
                    blob = np.asarray(m) == 64
                    big = blob.sum() > 0.002 * w * h
                    m = Image.fromarray(np.where(blob, 128 if big else 0, np.asarray(m)).astype(np.uint8)).copy()
                    px = m.load()
    alpha = Image.fromarray(np.where(np.asarray(m) == 128, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.9))
    rgba = im.convert("RGBA")
    rgba.putalpha(alpha)
    bb = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
    if not bb:
        sys.exit("FAILED: nothing left after keying; is the backdrop plain white?")
    bb, al = list(bb), np.asarray(alpha)
    # a row of mostly near-white opaque pixels at the bottom is floor glow
    while bb[3] > bb[1]:
        row = al[bb[3] - 1, bb[0]:bb[2]] > 24
        if row.any() and lo[bb[3] - 1, bb[0]:bb[2]][row].mean() > 190:
            bb[3] -= 1
        else:
            break
    return rgba.crop(bb), bb


if sys.argv[1:] == ["--selftest"]:
    im = Image.new("RGB", (200, 300), (250, 250, 250))
    d = ImageDraw.Draw(im)
    d.rectangle((60, 40, 140, 260), fill=(20, 20, 20))     # dark product
    d.rectangle((80, 120, 120, 180), fill=(250, 250, 250))  # white label inside it
    out, bb = key(im)
    al = np.asarray(out.getchannel("A"))
    assert 55 <= bb[0] <= 62 and 138 <= bb[2] <= 145, bb
    assert al[al.shape[0] // 2, al.shape[1] // 2] == 255, "enclosed white label must stay opaque"
    al = np.asarray(key(im, holes=True)[0].getchannel("A"))
    assert al[al.shape[0] // 2, al.shape[1] // 2] == 0, "--holes clears the enclosed white"
    print("DONE selftest")
elif len(sys.argv) >= 3:
    out, bb = key(Image.open(sys.argv[1]), holes="--holes" in sys.argv)
    out.save(sys.argv[2])
    print(f"DONE {sys.argv[2]} {out.size[0]}x{out.size[1]} crop {bb}")
else:
    sys.exit("usage: key_white.py in.png out.png [--holes] | --selftest")
