"""Prepare the supplied screenshots for the website.

The raw captures are 2500+px wide with large empty panels to the right and
below the actual content. Shipping them as-is would cost ~1.4 MB for the
whole set. Each frame is trimmed to its content box (always keeping the
left sidebar and the top bar, which carry the product's navigation) and
re-encoded as WebP.
"""
from PIL import Image
import os

SRC = '../source-screenshots'
DST = 'assets/images'

# name -> (source file, keep the left sidebar)
PLAN = {
    'app-vault':      ('1.png', True),
    'app-item-editor':('2.png', True),
    'app-audit':      ('3.png', True),
    'app-generator':  ('4.png', True),
    'app-settings':   ('5.png', True),
    'app-security':   ('6.png', True),
    'app-passkey':    ('7.png', True),
    'app-backup':     ('8.png', True),
    'app-trash':      ('9.png', True),
    'app-onboarding': ('1.0.png', True),
}

# Anything brighter than this counts as content; the UI ground is #08090e-ish.
THRESHOLD = 14
PAD = 24


def content_box(im):
    """Bounding box of non-background pixels, as a right/bottom extent only."""
    g = im.convert('L')
    w, h = g.size
    px = g.load()
    right, bottom = 0, 0
    step = 2  # coarse scan is plenty for a trim box
    for x in range(0, w, step):
        for y in range(0, h, step):
            if px[x, y] > THRESHOLD:
                if x > right:
                    right = x
                if y > bottom:
                    bottom = y
    return right, bottom


total_raw = total_out = 0
for name, (fname, keep_sidebar) in PLAN.items():
    src = os.path.join(SRC, fname)
    im = Image.open(src).convert('RGB')
    total_raw += os.path.getsize(src)

    w, h = im.size
    right, bottom = content_box(im)
    # Keep a slice of the trailing empty margin for breathing room.
    right = min(w, right + PAD * 6)
    bottom = min(h, bottom + PAD * 3)
    out = im.crop((0, 0, right, bottom))

    # Cap the long edge: these are decorative screenshots, not retina masters.
    if out.width > 1800:
        scale = 1800 / out.width
        out = out.resize((1800, round(out.height * scale)), Image.LANCZOS)

    path = os.path.join(DST, name + '.webp')
    out.save(path, 'WEBP', quality=82, method=6)
    total_out += os.path.getsize(path)
    print(f'{name:18} {im.size} -> {out.size}  {os.path.getsize(path)//1024} KB')

print(f'\nraw  : {total_raw//1024} KB')
print(f'webp : {total_out//1024} KB  ({total_out*100//total_raw}% of raw)')
