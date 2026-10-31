# Releasing and auto-update

## How a release happens

`.github/workflows/release.yml` runs on every push to `main` (commits that only touch `*.md` / `*.txt` are ignored):

1. **version** – version = `1.0.<workflow run number>` (1.0.1, 1.0.2, ...).
2. **windows** – bundles the app (`npm run desktop:prepare`) and runs `electron-builder --publish always`.
   This creates the GitHub release `v<version>` and uploads `CineFTP-Setup-<version>.exe`, its `.blockmap`, and `latest.yml`.
3. **android** – builds a debug-signed APK and attaches `CineFTP-<version>.apk` to the same release.

To publish an update: change files on GitHub (or push) to `main` and wait ~10-15 minutes.

## How the installed app updates itself

`electron/main.cjs` uses [`electron-updater`](https://www.electron.build/auto-update):

- checks GitHub 8 seconds after start and then every 4 hours (only in the installed app, not in development),
- on a newer version shows a Windows notification and an **Update now / Later** dialog,
- **Update now** downloads the installer (progress on the taskbar), installs silently and restarts the app.

The update source is configured in `package.json` → `build.publish` (`nurulislamtask/Cinema-FTP`).
The repository must stay **public** (the app downloads releases anonymously).

## One-time repository settings

- **Settings → Actions → General → Workflow permissions → Read and write permissions** (needed to create releases).
- Repository visibility: **Public**.

## Notes

- The installer is not code-signed, so Windows SmartScreen shows a warning on first install. Updates still work.
- The first installer must be installed manually; versions installed from it update automatically.
