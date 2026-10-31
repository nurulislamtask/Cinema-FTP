# Android app

The Android app is the same React UI packaged with [Capacitor](https://capacitorjs.com/).
A phone has no Node backend, so `src/mobile/apiShim.ts` answers the `/api/*` calls on the device
(directory browsing, posters/metadata, subtitles) using Capacitor's native HTTP client. It talks to LAN servers directly.

## Get the APK

Download `CineFTP-<version>.apk` from the [Releases](https://github.com/nurulislamtask/Cinema-FTP/releases/latest) page.
It is built automatically by the release workflow (debug-signed, for personal use).

## Limits compared to the desktop app

- No ffmpeg: MKV / AC3 / HEVC play only if the phone's WebView can decode them. MP4 (H.264 + AAC) is the safest.
- No AI assistant, no embedded-subtitle extraction, no `ftp://` links (use the `http://` address).
- The phone must be on the same network (e.g. BDIX / ISP LAN) as the media servers.

## Build manually

Run **Actions → Build Android APK → Run workflow** and download the `CineFTP-apk` artifact,
or locally: `npm install --legacy-peer-deps && npx vite build && npx cap add android && python scripts/android-prepare.py && npx cap sync android`, then build `android/` with Android Studio / Gradle.
