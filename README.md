# Orbit

Your personal connection between **Zeiron** and **Legion Go**. Orbit owns device identity, trust, sessions, connection state, and recovery. Unmodified Sunshine and Moonlight provide the streaming engines behind it.

## Zeiron

1. Review and run `Setup Orbit Host.ps1`.
2. Open **Start Orbit Host.cmd**; hosting starts automatically.
3. Stop any other host occupying the streaming ports first; Orbit does not stop it automatically.
4. Approve the reviewed local-network firewall access for the Legion Go, including Orbit's TCP 38742 control channel. Setup does not add rules.
5. Approve the pending Legion Go request using the four-digit code shown on the handheld.

## Legion Go

1. Review and run `Setup Orbit.ps1`, then open **Start Orbit.cmd**.
2. Orbit resolves Zeiron using its saved device information or ZEIRON-CORE on the LAN.
3. Select **Link Zeiron**. Enter the handheld’s four-digit code in the pending request in Orbit Host on Zeiron. Orbit coordinates streaming trust.
4. Once Zeiron shows **Online**, browse its installed games, select a cover and press **Play on Legion Go**. Zeiron launches the game and Orbit starts the stream. **Your PC** also offers Desktop and optional Steam Big Picture.

After linking, trust persists locally. Play starts future sessions directly; your device link is preserved. Orbit observes connection state and retries unexpected disconnects up to three times. Ending a session returns to Orbit without quitting the host app.

Keep both devices on the home network. The optional Steam Big Picture session is enabled from Orbit Host while hosting is stopped.

## Development and migration

- Read [ARCHITECTURE.md](ARCHITECTURE.md) for ownership, state transitions, trust boundaries and remaining validation.
- [HOST.md](HOST.md) describes the host engine setup and local security.
- Preserve existing `data/`, portable runtimes, and Moonlight configuration when updating. Existing streaming pairing is reused when valid; Orbit's own device link is new.
- If script execution is blocked, do not weaken Windows execution policy.
- `Start Simulator.cmd` remains an isolated legacy UI simulator. It does not exercise the new control plane or establish a real stream.
- `host/` is the older loopback browser preview, not the production host.

## Source and private state

`runtime/resources/app/control/` owns the control plane. `client-main.cjs` and `host-main.cjs` expose narrow IPC operations to sandboxed Orbit windows. No shell-command endpoint is exposed.

Device registries, engine pairings, certificates, management credentials, logs and profiles remain under ignored local directories. Downloaded binaries are excluded from Git.

Run `node --test tests/*.test.cjs` to validate the coordinator and host safety. Actual Legion Go media and controller tests remain necessary after each architectural change.

Orbit’s in-stream menu offers **Resume**, **Close game**, stream volume, and quality for the next session. Closing a game also closes its owned process on Zeiron; Desktop sessions return to the library. Tap **Orbit · Menu** or press **Ctrl+Alt+O**. With a detected controller, hold **View + Menu** to open it; use the D-pad or stick to move, **A** to select and **B** to resume/back. Closing asks for confirmation with Cancel selected. Volume affects only the local Moonlight audio session and is unavailable if Windows exposes no stream audio device. Quality changes do not interrupt the current game. Physical Legion Go controller acceptance remains necessary after installing this update. Original streaming-engine licenses and attribution remain intact.

Desktop mode has its own blue loading screen and session menu. Loading screens name the requested game/app or **Desktop**, independently of the selected library card. The host uses the handheld display profile for Desktop too, then restores its original mode when the session ends. Desktop’s temporary loading cover clears once streaming connects; game sessions keep their named cover behind the game. **End Desktop** returns to Orbit without closing apps on Zeiron.
