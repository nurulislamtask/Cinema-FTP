"""Run after `npx cap add android`: allow plain-http LAN servers, set app icon + dark colors."""
import os, re, sys
from PIL import Image

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
res = os.path.join(root, 'android', 'app', 'src', 'main', 'res')
manifest = os.path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')

# 1) cleartext (http://172.16.x.x ...) must be allowed
m = open(manifest, encoding='utf8').read()
if 'usesCleartextTraffic' not in m:
    m = m.replace('<application', '<application android:usesCleartextTraffic="true"', 1)
# landscape + portrait, keep playing on rotation
if 'configChanges' in m and 'screenSize' not in m:
    pass
open(manifest, 'w', encoding='utf8').write(m)

# 2) icons from build/icon.png
src = Image.open(os.path.join(root, 'build', 'icon.png')).convert('RGBA')
sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for d, px in sizes.items():
    folder = os.path.join(res, f'mipmap-{d}')
    os.makedirs(folder, exist_ok=True)
    legacy = src.resize((px, px), Image.LANCZOS)
    legacy.save(os.path.join(folder, 'ic_launcher.png'))
    # round launcher
    mask = Image.new('L', (px, px), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse([0, 0, px - 1, px - 1], fill=255)
    rnd = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    rnd.paste(legacy, (0, 0), mask)
    rnd.save(os.path.join(folder, 'ic_launcher_round.png'))
    # adaptive foreground: 108dp canvas, artwork inside the 66dp safe zone
    fg_px = int(px * 108 / 48)
    fg = Image.new('RGBA', (fg_px, fg_px), (0, 0, 0, 0))
    art = int(fg_px * 0.60)
    a = src.resize((art, art), Image.LANCZOS)
    fg.paste(a, ((fg_px - art) // 2, (fg_px - art) // 2), a)
    fg.save(os.path.join(folder, 'ic_launcher_foreground.png'))
    for stale in ('ic_launcher.webp', 'ic_launcher_round.webp', 'ic_launcher_foreground.webp'):
        p = os.path.join(folder, stale)
        if os.path.exists(p):
            os.remove(p)

bg = os.path.join(res, 'values', 'ic_launcher_background.xml')
os.makedirs(os.path.dirname(bg), exist_ok=True)
open(bg, 'w', encoding='utf8').write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#090A0F</color>\n</resources>\n')

# 3) dark splash/status bar background
colors = os.path.join(res, 'values', 'colors.xml')
open(colors, 'w', encoding='utf8').write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="colorPrimary">#090A0F</color>\n'
    '    <color name="colorPrimaryDark">#090A0F</color>\n    <color name="colorAccent">#E50914</color>\n</resources>\n')
print('android prepared')
