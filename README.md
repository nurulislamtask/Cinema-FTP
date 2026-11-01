<div align="center">

# CineFTP

**A cinema-style browser and player for FTP / HTTP open-directory media servers.**
Point it at your server links and get a Netflix-like library: posters, years, quality tags, series and seasons, and a built-in player.

[![Latest release](https://img.shields.io/github/v/release/nurulislamtask/Cinema-FTP?label=download&color=E50914)](https://github.com/nurulislamtask/Cinema-FTP/releases/latest)
[![Build](https://github.com/nurulislamtask/Cinema-FTP/actions/workflows/release.yml/badge.svg)](https://github.com/nurulislamtask/Cinema-FTP/actions/workflows/release.yml)

[Download](https://github.com/nurulislamtask/Cinema-FTP/releases/latest) · [বাংলা গাইড](README.bn.md) · [Report a bug](https://github.com/nurulislamtask/Cinema-FTP/issues/new/choose)

</div>

---

## Download

Go to the **[Releases](https://github.com/nurulislamtask/Cinema-FTP/releases/latest)** page:

| Platform | File | Notes |
| --- | --- | --- |
| Windows 10 / 11 | `CineFTP-Setup-<version>.exe` | Installer, creates a Desktop and Start Menu shortcut. **Updates itself.** |
| Android | `CineFTP-<version>.apk` | Install manually (allow "Install unknown apps"). Download the new APK to update. |

> Windows may show *"Windows protected your PC"* because the app is not code-signed. Click **More info → Run anyway**.

## Features

- **Open-directory browser** – works with Apache / nginx / h5ai style listings (`http://`, `https://`; `ftp://` on desktop/web).
- **Automatic library** – folders are scanned (year folders, `A–Z` buckets, quality folders) and shown as movie / series cards, newest first, duplicates (720p + 1080p) merged to the best quality.
- **Posters and details** – fetched automatically (IMDb suggestions, TVMaze, iTunes), cached locally so the next start is instant.
- **Cinema player** – seek bar, speed, subtitles, multi-audio tracks, resume. On Android a native MX-Player-style player with swipe brightness / volume / seek gestures.
- **Plays more formats on desktop** – MKV, AC3 / DTS audio and HEVC are converted on the fly with a bundled `ffmpeg`.
- **Direct LAN access** – the desktop and Android apps talk to private BDIX / LAN servers (`172.16.x.x`, `192.168.x.x`) directly.
- **Watchlist, recently played, search, filters** (industry, genre, year, audio).
- **Auto-update (Windows)** – a notification appears when a new release is published.

## Quick start (users)

1. Install the app from the latest release.
2. Open **Settings → Sources → Add source**, paste a folder link, e.g. `http://172.16.50.14/DHAKA-FLIX-14/Hindi%20Movies/`.
3. Open the source from the sidebar. The first scan of a big server takes a little while; afterwards it is cached.


## Development

Requirements: Node.js 22+.

```bash
npm install --legacy-peer-deps
npm run dev                # web version: Express backend + Vite on http://localhost:3000
npm run desktop:run        # desktop app in development (Electron)
npm run desktop:build      # Windows installer -> release/
```

On Windows you can also double-click `build-windows.bat` (builds the installer) or `run-desktop-dev.bat`.

### Project structure

```
src/                React UI (components, ftpClient service, directory parser)
src/mobile/         Android shim: answers the /api routes on the phone itself
api/index.ts        Express backend (browse, metadata, stream proxy, ffmpeg transcode, probe)
electron/           Desktop shell (main process, auto-update) + server entry
scripts/            Desktop bundler, Android icon / manifest preparation
.github/workflows/  Release pipeline (Windows installer + Android APK)
docs/               Android build and release / auto-update notes
```

## Releases and auto-update

Every commit to `main` builds the Windows installer and the Android APK and publishes them as release `v1.0.<run number>`.
Installed Windows apps check GitHub for the newer release and offer **Update now / Later**.
Details: [docs/RELEASING.md](docs/RELEASING.md) · Android: [docs/ANDROID.md](docs/ANDROID.md).

## Disclaimer

CineFTP is a browser/player for servers you already have access to. It does not host, provide or distribute any media.
Respect the terms of the servers you connect to and the copyright laws that apply to you.
