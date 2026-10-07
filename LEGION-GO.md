# Orbit Legion Go — portable launcher and simulator

## On the Legion Go

1. Copy and extract the entire `Orbit-Legion-Go` folder to a persistent location on the handheld, such as `C:\Apps\Orbit`.
2. Double-click **Start Orbit.cmd**. The launcher opens as its own Windows app, initially fullscreen. It does not need Node installed separately.
3. Select **Set up connection** and enter your gaming PC's name or local IPv4 address. Both devices must be on the same LAN.
4. Select **Open Moonlight to pair**. In Moonlight, add the gaming PC and complete its supported PIN pairing. Orbit Host must be running on the gaming PC; select Start hosting there.
5. Return to Orbit and refresh. Orbit uses Moonlight's real paired-host app list. Select Desktop or another exposed app to start a stream. If pairing or the host connection is unavailable, Orbit shows that state and does not invent a library.

The host check currently uses the default GameStream HTTP port **47989**. Custom host ports and internet streaming are not implemented. A local IPv4 address is preferable if PC-name resolution is unreliable.

The existing browser-based Orbit host on the gaming PC is not required for this launcher. The launcher talks to Orbit Host’s Sunshine backend through bundled Moonlight. Streaming does not use the old `127.0.0.1:38741` browser preview.

`Install Legion Go Shortcut.ps1` can create an optional desktop shortcut after extraction. It does not add Windows startup entries.

## Try the simulator on this PC

Double-click **Start Simulator.cmd**, or use the **Orbit Legion Go Simulator** desktop shortcut created on the development PC.

The simulator is a separate app instance using its own saved data. It models the original Legion Go's **16:10** screen using a roughly **1280 × 800 logical viewport**, representing **2560 × 1600 at 200% scaling**. A clearly labeled panel lets you test:

- Paired, unpaired, and offline host states.
- A/B, D-pad, and LB/RB navigation through the same handlers used by a real controller.
- Simulated app launch and return to Orbit.
- Profile persistence, dialogs, keyboard/touch controls, and fullscreen.

The sample Desktop, Controller test, and Media demo tiles are **simulation fixtures**, not detected installed games. The simulated streaming screen carries a prominent simulation label and sends no video. Simulator pairing/launch actions do not launch Moonlight or contact a host.

This is **interface and launch-flow simulation**, not an emulation of the Legion Go's AMD hardware, Windows image, network, latency, audio, or physical controls. It is not a VM. Real handheld validation remains necessary.

## Profiles

| Profile | Resolution | Frame rate | Bitrate |
|---|---|---|---|
| Balanced | 1920 × 1200 | 60 fps | 20 Mbps |
| Smooth | 1920 × 1200 | 120 fps | 35 Mbps |
| Sharp | 2560 × 1600 | 60 fps | 35 Mbps |

These initial profiles assume the original Legion Go and require adjustment/testing for the actual model. Orbit passes the selected profile to Moonlight when a real stream starts. Games are left running on the host when the stream ends; Orbit does not force-quit them.

During a real stream, Orbit minimizes and Moonlight handles video, sound, touch and controller forwarding. When the Moonlight process exits, Orbit restores its window. If another Moonlight window remains open, close it to return automatically.

## Isolation and local changes

- This is a self-contained portable Windows x64 app, with its own Electron runtime and Moonlight portable client.
- The interface runs with renderer sandboxing, context isolation, and Node integration disabled. It loads local bundled files and does not expose arbitrary command execution or navigation.
- Launcher data: `data\launcher`.
- Simulator data: `data\simulator`.
- Moonlight's pairing/configuration/cache data remains inside its portable `moonlight` folder. Moonlight may perform its own normal network discovery and compatibility checks when used; it is not sandboxed by Electron.
- Settings saved by the simulator do not affect the launcher, your normal browser profile, or Razer Cortex.
- No Windows startup entry, VM, driver, firewall change, router change, global controller mapping, or host display/audio change was made.
- Process/profile isolation and a sandboxed renderer do **not** provide full VM-level OS isolation.

The bundle contains no development-PC pairing certificates, saved profiles, or browser cache. Each extracted copy creates fresh local data on first use.

## What was validated

The standalone native simulator and launcher were launched directly on Windows. Checks covered sandbox settings, separate user-data directories, virtual controller navigation, host-state scenarios, launch refusal while unpaired, simulated launch/return, saved-profile persistence, malformed-host rejection, and layout overflow. Bundled Moonlight launched and reported version 6.2.0.

Actual LAN pairing, streaming video/audio, real controller latency, native display behavior and real Legion Go hardware have **not** been validated. The launcher is ready to copy and pair, not a claim of completed handheld setup.

## Components and provenance

- Orbit launcher source: `runtime\resources\app`.
- Electron **44.5.1**, Windows x64, downloaded from the [official Electron release](https://github.com/electron/electron/releases/tag/v44.5.1). Its archive matched the official SHASUMS256 entry.
- Moonlight **6.2.0**, Windows x64 portable, downloaded from the [official Moonlight release](https://github.com/moonlight-stream/moonlight-qt/releases/tag/v6.2.0). Its archive matched the release asset's official SHA-256 digest.
- Original component licenses and notices are preserved in the runtime and Moonlight distribution.
- Orbit source is provided in the bundle; it can be inspected and edited without rebuilding a compiled installer.

Close the app to stop its interface processes. It does not register a background Windows service.
