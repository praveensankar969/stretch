# Changelog

## 2.0.0 — 2026-09-22

- Redesigned Mac dashboard, onboarding, movement library, preferences, app icon, and menu bar icon.
- Ten sourced movements with an articulated guide, synchronized phases, timed side changes, preparation, pause/resume, reduced motion, and a three-movement routine.
- New single-clock scheduler; corrected snooze close races, manual breaks during quiet/paused periods, idle return, sleep/lock handling, and settings resetting reminders.
- Small non-focusing reminder cards with macOS fullscreen-Space visibility and reversible immersive view on the current display.
- Validated settings, atomic config writes, history migration, accurate local-date streaks, and guarded completion credit.
- Redesigned responsive website, working movement demo, current privacy policy, and release-aware Mac download page.
- Electron 44, refreshed build dependencies, local SVG assets, Mac icon prebuild, hardened-runtime signing support, and automated motion/scheduler/UI checks.
- Manual updates in 2.0; legacy Lottie assets are no longer shipped in the app.

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-05-15

### Added
- macOS support: menu bar app with template icon, DMG installer.
- Ad-hoc signed universal binary (arm64 + x64).
- macOS-native Edit menu (Cmd+C/V/X/A).
- Platform-aware onboarding and settings copy.

## [1.0.0] — 2026-04-23

### Added
- First public release.
- Tray-resident scheduler with configurable interval (5–240 minutes).
- Full-viewport soft-blur reminder overlay with keyboard shortcuts (Enter / Esc / S).
- Ten desk-safe stretches authored as Lottie loops, referenced against NHS / ACE Fitness / Mayo Clinic sources.
- Quiet hours with Windows Focus Assist awareness.
- Idle detection and full-screen app detection — the app stays silent during meetings, games, and breaks.
- Per-day counter, weekly sparkline, and consecutive-day streak.
- First-run onboarding with cadence and quiet-hours picker.
- Local-only config at `%APPDATA%/Stretch/config.json`. No telemetry.
- Auto-update via GitHub Releases (`electron-updater`).
- Signed NSIS installer (pending publisher certificate).
- Morning Light design system: Fraunces + Instrument Sans, warm ink on paper, self-hosted fonts, strict CSP, context-isolated preload bridge.
