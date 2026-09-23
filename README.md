# Stretch 2.0

A little room to move. A private, Mac-first stretch reminder with gentle illustrated movement, thoughtful reminders, and local daily progress.

## What's new

- A redesigned dashboard, ten-movement library, body-area preferences, and a 1 minute 54 second desk reset.
- An articulated SVG guide with fixed segment lengths, smooth transitions, timed holds, both-side cues, and pause/resume. It is illustrative guidance, not clinical motion capture.
- Exercise-specific camera angles, hand/forearm and ankle/foot close-ups, and Guide / Front / Side controls in the Mac player and website demo. Switching views preserves the movement and timer.
- Small reminders without keyboard focus; optional visibility over macOS fullscreen Spaces. Expand a player on its current display, then press Escape to return.
- One reminder scheduler for cadence, quiet hours, snooze, idle, lock, and sleep. No catch-up storm on wake. Manual sessions work while reminders are paused.
- Local counts, minutes, and a seven-day history. A completed routine counts as one break. Skips and previews do not earn credit.
- An interactive, responsive website with movement sources and honest download/privacy information.
- Electron 44.4.3, isolated renderers, validated settings, an allowlisted IPC bridge, and local assets.

## Develop

Requires Node.js 22+ and npm. For Mac packaging, use macOS with Xcode command-line tools.

```sh
npm install
# If npm's install-script policy withheld the Electron download:
node node_modules/electron/install.js
npm start
```

Assets are generated locally by `npm run icons`; fonts ship in the repository. The app does not need a network connection. `npm run site:preview` serves the website at http://127.0.0.1:4173.

## Validate

```sh
npm test
npx playwright install chromium
npm run test:ui
```

The UI suite launches a real Electron process using a fresh temporary data directory. It covers onboarding, settings persistence, manual breaks while paused, early-completion rejection, pause, lock/resume, immersive view, completion credit, snooze, and minimum window size. It also checks the website at desktop/mobile sizes, the interactive demo, reduced motion, privacy, and download pages. Screenshots go to `artifacts/screenshots/`.

The deterministic tests cover configuration migration, quiet-hour boundaries, idle return, overlapping sleep/lock states, cadence/snooze preservation, local-date streaks, frame-rate-independent timing, fixed limb lengths, transition continuity, rigid camera transforms, and framing throughout every movement. The UI suite checks camera switching while paused and with reduced motion, and saves a comparison sheet of every movement in all three views.

## Movement views

Guide selects a fixed angle for each movement:

| Movement                                   | Guide view         | Framing            |
| ------------------------------------------ | ------------------ | ------------------ |
| Neck turns, standing side bends, breathing | Front              | Whole body         |
| Shoulder rolls                             | Three-quarter side | Whole body         |
| Chest opener, seated twist                 | Three-quarter      | Whole body         |
| Wrist and forearm releases                 | Side               | Hands and forearms |
| Ankle pumps                                | Side               | Ankles and feet    |
| Walking break                              | Side               | Whole body         |

Front and Side let users inspect the same pose from another angle. Guide returns to the recommended view; each new movement starts in Guide. Close-ups keep a fixed frame across both sides, with the active limb emphasized. The camera never orbits or zooms during a repetition. Reduced motion uses a still demonstration and supports the same view controls.

The renderer applies an orthonormal camera rotation to the original 3D joint positions before projecting them into SVG. A torso with depth, a projected chair, profile facial features, and limb depth ordering make side views readable without distorting the skeleton. Camera changes do not alter exercise timing, joint positions, or side cues. These are schematic illustrations; the camera and interpolation math do not establish clinical biomechanical accuracy.

## Build for Mac

```sh
npm run build:mac -- --publish never
```

For a locally signed test build on your current Mac architecture, run `npm run build:mac:local`. That command disables hardened runtime for the ad-hoc build; the distribution build retains it.

The distribution build targets `dist/Stretch-2.0.0-arm64.dmg`, `dist/Stretch-2.0.0-x64.dmg`, and matching ZIPs. `npm run build:mac:dir` creates app bundles. The icon prebuild runs for Mac builds.

Developer ID signing and notarization use electron-builder's standard Apple credential environment variables when supplied. Local builds without those credentials are not notarized distribution releases. Review release notes and signing status before publishing. Downloads on the website lead to published releases rather than assuming an unpublished 2.0 asset exists.

Windows build configuration is retained (`npm run build:win`), but the 2.0 validation effort is Mac-first. Existing Windows releases remain available on GitHub. Stretch 2.0 uses manual updates, with no update polling.

## Reminder behavior

The default cadence is 30 minutes, configurable from 5 to 240 minutes. Quiet hours default to 18:00–09:00. More than five minutes of system idle defers automatic reminders. Returning from idle or unlocking/waking starts a fresh interval. Overlapping lock and sleep states must both clear.

A small card does not take keyboard focus. “Show over fullscreen apps” controls macOS Space visibility, not meeting detection. Stretch does not detect other applications' fullscreen state, meetings, or macOS Focus. Pause or snooze when needed. The player can use the whole display without entering a new native fullscreen Space.

The guide begins only after clicking “Let's begin.” Enter/Space can control it after focus. Escape leaves immersive view, or closes the compact player. Saving a completed break starts the next interval; snoozing replaces it with the selected delay. Changing unrelated preferences does not reset reminders.

## Research and privacy

Movement references and timing adaptations: [Exercise research](docs/EXERCISE-RESEARCH.md). Technical and manual release checks: [Release validation](docs/RELEASE-VALIDATION.md).

Keep movement comfortable; stop if it hurts. Short routines complement longer screen breaks and physical activity. Ask a health professional if suitability is uncertain.

Preferences and up to 365 entries of local daily progress live in `~/Library/Application Support/Stretch/config.json` on Mac. Version 1 history is migrated without deleting the original data. No telemetry, cloud syncing, or accounts. See [Privacy](PRIVACY.md).

MIT licensed. [Source and published releases](https://github.com/praveensankar969/Stretch).
