# Privacy

Short version: Stretch has no server, no telemetry, and no tracking. Everything lives on your machine.

## What Stretch stores

A single JSON file on your computer:

- **Windows:** `%APPDATA%/Stretch/config.json`
- **macOS:** `~/Library/Application Support/Stretch/config.json`

It contains:

- Your chosen reminder interval and daily goal.
- Your quiet-hours window and Focus Assist preference.
- `history`: a map of `YYYY-MM-DD → number of stretches completed` for recent days.
- Your current streak.

That file never leaves your device.

## What Stretch transmits

1. **Update checks.** Every six hours the app asks GitHub for the latest release manifest. GitHub sees your IP address, the same way your browser does when you visit github.com. We do not operate any server that observes these requests.
2. **Nothing else.** No analytics, crash reporter, telemetry, remote feature flags, A/B tests, CDN fonts, or remote scripts.

## What the app never does

- Read your screen content, keystrokes, clipboard, or microphone.
- Record which app is in the foreground. Stretch only asks the OS "is a full-screen app active" so it can stay quiet. No app name is read.
- Upload your stretch history, streak, or settings anywhere.

## Removing everything

- **Windows:** Uninstall Stretch from Windows Settings → Apps. To also erase your saved data, delete `%APPDATA%/Stretch/`.
- **macOS:** Drag Stretch from Applications to Trash. To also erase your saved data, delete `~/Library/Application Support/Stretch/`.

## Changes

If any of the above ever changes, we'll say so in the in-app update dialog before the change ships, and the commit history of this file will record it.

Last updated: 2026-05-15.
