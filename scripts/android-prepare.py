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

# 4) native video player (ExoPlayer / media3): Java sources, activity, gradle dependencies
import shutil
MEDIA3 = '1.9.0'
java_dir = os.path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'cineftp', 'mobile')
os.makedirs(java_dir, exist_ok=True)
for f in ('MainActivity.java', 'NativePlayerPlugin.java', 'PlayerActivity.java', 'SubtitleFinder.java'):
    shutil.copyfile(os.path.join(root, 'android-native', 'java', f), os.path.join(java_dir, f))

m = open(manifest, encoding='utf8').read()
if 'PlayerActivity' not in m:
    act = ('<activity android:name=".PlayerActivity" android:exported="false" '
           'android:theme="@style/Theme.AppCompat.NoActionBar" '
           'android:screenOrientation="sensorLandscape" '
           'android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout|keyboardHidden|uiMode|density" />')
    m = m.replace('</application>', '    ' + act + '\n    </application>', 1)
open(manifest, 'w', encoding='utf8').write(m)

app_gradle = os.path.join(root, 'android', 'app', 'build.gradle')
g = open(app_gradle, encoding='utf8').read()
if 'media3-exoplayer' not in g:
    deps = ('    implementation "androidx.media3:media3-exoplayer:%s"\n'
            '    implementation "androidx.media3:media3-ui:%s"\n'
            '    implementation "org.jellyfin.media3:media3-ffmpeg-decoder:%s+1"\n') % (MEDIA3, MEDIA3, MEDIA3)
    g = re.sub(r'dependencies\s*\{', lambda mo: mo.group(0) + '\n' + deps, g, count=1)
    open(app_gradle, 'w', encoding='utf8').write(g)

vars_gradle = os.path.join(root, 'android', 'variables.gradle')
if os.path.exists(vars_gradle):
    v = open(vars_gradle, encoding='utf8').read()
    v = re.sub(r'compileSdkVersion\s*=\s*\d+', 'compileSdkVersion = 36', v)
    open(vars_gradle, 'w', encoding='utf8').write(v)
# media3 needs a newer Android Gradle plugin than the Capacitor template ships: allow the newer compileSdk
props = os.path.join(root, 'android', 'gradle.properties')
if os.path.exists(props):
    t = open(props, encoding='utf8').read()
    if 'suppressUnsupportedCompileSdk' not in t:
        t += '\nandroid.suppressUnsupportedCompileSdk=36\n'
    open(props, 'w', encoding='utf8').write(t)

# 5) stable signing key (updates only install over the old app when the signature is the same) + version numbers
shutil.copyfile(os.path.join(root, 'android-native', 'cineftp.keystore'),
                os.path.join(root, 'android', 'app', 'cineftp.keystore'))
ver = os.environ.get('APP_VERSION', '1.0.0')
code = os.environ.get('APP_VERSION_CODE', '1')
g = open(app_gradle, encoding='utf8').read()
if 'cineftp.keystore' not in g:
    g += """

android {
    signingConfigs {
        cineftp {
            storeFile file('cineftp.keystore')
            storePassword 'cineftp123'
            keyAlias 'cineftp'
            keyPassword 'cineftp123'
        }
    }
    defaultConfig {
        versionCode %s
        versionName '%s'
    }
    buildTypes {
        debug { signingConfig signingConfigs.cineftp }
        release { signingConfig signingConfigs.cineftp }
    }
}
""" % (code, ver)
    open(app_gradle, 'w', encoding='utf8').write(g)

m = open(manifest, encoding='utf8').read()
if 'REQUEST_INSTALL_PACKAGES' not in m:
    m = m.replace('<application', '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n    <application', 1)
    open(manifest, 'w', encoding='utf8').write(m)
print('native player installed')
print('android prepared')
