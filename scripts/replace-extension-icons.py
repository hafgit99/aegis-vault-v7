"""Replace the browser extension icons with the current KalderaShield mark.

The extension still shipped the AegisVault artwork: a dark shield with a gear
and a "7". The desktop app, the website and the favicons all use the caldera
shield, so the extension was the last surface still showing the old brand --
and the one a user is most likely to have pinned to their toolbar.

Sizes 16/48/128 are written to the source icons, the built extension, and the
packaged copies under release-local, which are the artifacts that actually get
shipped.
"""
from PIL import Image
import os

SRC = 'src-tauri/icons/icon.png'
TARGETS = {
    16: [
        'src-extension/icons/icon16.png',
        'dist-extension/icons/icon16.png',
        'release-local/windows/browser-extension/chromium/icons/icon16.png',
        'release-local/windows/browser-extension/firefox/icons/icon16.png',
        'release-local/windows/browser-extension/safari/icons/icon16.png',
    ],
    48: [
        'src-extension/icons/icon48.png',
        'dist-extension/icons/icon48.png',
        'release-local/windows/browser-extension/chromium/icons/icon48.png',
        'release-local/windows/browser-extension/firefox/icons/icon48.png',
        'release-local/windows/browser-extension/safari/icons/icon48.png',
    ],
    128: [
        'src-extension/icons/icon128.png',
        'dist-extension/icons/icon128.png',
        'release-local/windows/browser-extension/chromium/icons/icon128.png',
        'release-local/windows/browser-extension/firefox/icons/icon128.png',
        'release-local/windows/browser-extension/safari/icons/icon128.png',
    ],
}

base = Image.open(SRC).convert('RGBA')
print('kaynak:', base.size)

# The source artwork has a soft outer glow with a large transparent margin.
# Toolbar icons are rendered against unknown backgrounds, so trim that margin
# first: at 16px the glow would otherwise reduce the shield to a few pixels.
bbox = base.split()[3].getbbox()
trimmed = base.crop(bbox)
print('kirpildi:', trimmed.size)

written = 0
for size, paths in TARGETS.items():
    # Downscale from the largest prepared master rather than the full source,
    # with LANCZOS so the caldera silhouette stays crisp at 16px.
    out = trimmed.resize((size, size), Image.LANCZOS)
    buf = os.path.join('.tmp', f'ext-icon-{size}.png')
    os.makedirs('.tmp', exist_ok=True)
    out.save(buf)
    for p in paths:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        out.save(p)
        written += 1
    print(f'  {size}px -> {len(paths)} dosya')

print(f'\n{written} ikon dosyasi guncellendi')
