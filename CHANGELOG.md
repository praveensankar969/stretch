# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
