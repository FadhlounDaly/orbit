# Orbit

A local handheld-style home screen for this PC and a future Legion Go streaming connection.

## Open Orbit

Use the **Orbit desktop shortcut** on this PC, or run `start-orbit.ps1` with Windows PowerShell. Orbit opens in an Edge app window where available.

Local address: **http://127.0.0.1:38741/**.

The launcher uses Node.js installed on PATH. It does not install another runtime or add Windows startup entries. Run the launcher from this repository; desktop shortcuts may require updating if the folder moves.

## What works now

- Home, Play, and Desktop navigation.
- Original Orbit background artwork, responsive layout, keyboard and touch navigation.
- Standard controller navigation: left stick / D-pad to move, A to select, B to go back, LB/RB to change tabs.
- Actual Windows PC name, NVIDIA GPU and Razer Remote Play process detection.
- Read-only discovery of installed Steam titles. Original Steam files are never modified.
- Refreshing status, connection instructions, and saved profile preferences.
- User-triggered fullscreen.
- Honest host-offline and unpaired states.

Profiles are **preferences**, not settings already applied to the streaming host. They currently assume the original Legion Go; final resolution and refresh rate require the actual device model and a streaming test.

## Not connected yet

Orbit currently listens only on this PC's loopback interface. The Legion Go cannot open this local address. LAN access, its launcher, streaming pairing, session launch/return, and physical controller/audio validation are the next integration step.

No game launches are enabled yet. Clicking a discovered title opens its connection/setup dialog. Your tools, media and app categories are clearly marked as planned.

Razer Cortex and its streaming configuration have not been changed. Sunshine and Moonlight have not been installed. No firewall or router settings were changed.

## Close and stop

Closing the Orbit window leaves its lightweight local service running so it can reopen quickly. Run `stop-orbit.ps1` to stop only this Orbit server process. This is not a Windows startup service.

## Validation

Checked using the installed Microsoft Edge browser:

- Live PC data and actual Steam library.
- Home, Play, Desktop, dialogs and profile persistence.
- Keyboard focus and simulated standard-controller tab/back behavior.
- Layout widths 1280, 800 and 390 pixels, without horizontal overflow.
- Host-unavailable behavior, with no invented live status.

Physical Legion Go controls and streaming/audio remain untested. Optional WebMCP handlers were exercised against a mock registry; native browser WebMCP support was unavailable.

## Files and local changes

- `dist/`: interface, styles, client behavior, artwork and favicon.
- `server.cjs`: dependency-free, read-only local host bridge.
- `start-orbit.ps1` / `stop-orbit.ps1`: local launch and stop helpers.
- An existing desktop shortcut may still point to the original preview folder.
- Profile preference: browser local storage key `orbit-profile`.

The server reads Steam library manifests and queries Windows GPU/process information. It accepts only GET/HEAD requests, binds to `127.0.0.1`, and checks its Host header. Expanding it to LAN access or adding launch controls requires a paired/authenticated connection design rather than merely changing its bind address.
