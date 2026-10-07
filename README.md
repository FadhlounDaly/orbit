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

Orbit 0.8 adds a branded launch transition and an in-stream Orbit menu. Tap **Orbit · Menu** at the top-right, then **End stream** to close the owned streaming process and return to the library. The game stays open on Zeiron. **Ctrl+Alt+O** also opens the menu. Update the client on the physical handheld to use these controls. Original streaming-engine licenses and attribution remain intact.
