# Android app

The Android app is the same React UI packaged with [Capacitor](https://capacitorjs.com/).
A phone has no Node backend, so `src/mobile/apiShim.ts` answers the `/api/*` calls on the device
(directory browsing, posters/metadata, subtitles) using Capacitor's native HTTP client. It talks to LAN servers directly.

## Get the APK

Download `CineFTP-<version>.apk` from the [Releases](https://github.com/nurulislamtask/CineFTP-Releases/releases/latest) page.
It is built automatically by the release workflow (debug-signed, for personal use).

## Player (MX Player style)

Videos open in a native full-screen player (ExoPlayer, `android-native/java`):

- Swipe up/down on the **left** = brightness, on the **right** = volume; swipe left/right = seek.
- Double-tap left / right = -10 s / +10 s, double-tap middle = play / pause, long-press = 2x speed while held.
- Pinch = zoom / fit; the top-right button cycles Fit / Zoom / Stretch.
- Gear button = playback speed, audio track, subtitles (external `.srt` / `.vtt` from the folder are listed automatically).
- Plays MKV, HEVC and AC3 / EAC3 / DTS audio (software ffmpeg decoders are bundled). Next / previous episode buttons use the season's episode list, and the last position is remembered.

## Limits compared to the desktop app

- No on-device ffmpeg transcoding and no AI assistant; no `ftp://` links (use the `http://` address).
- The phone must be on the same network (e.g. BDIX / ISP LAN) as the media servers.

## Build manually

Run **Actions → Build Android APK → Run workflow** and download the `CineFTP-apk` artifact,
or locally: `npm install --legacy-peer-deps && npx vite build && npx cap add android && python scripts/android-prepare.py && npx cap sync android`, then build `android/` with Android Studio / Gradle.
