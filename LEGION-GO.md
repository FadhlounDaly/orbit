# Orbit on Legion Go

Orbit is the personal client for Zeiron. It owns device linking, session selection, connection state, and recovery; its bundled streaming engine handles picture, sound, and controller transport.

## Update the existing installation

1. Close Orbit and any active stream.
2. In `C:\Apps\Orbit`, inspect local changes before updating from the reviewed Git branch. Preserve `data/`, `moonlight/`, and `runtime/` binaries; do not reset or delete local pairing data.
3. Read `README.md`, `ARCHITECTURE.md`, and the setup script before running setup. Setup downloads verified portable dependencies if needed. Do not weaken Windows execution policy.
4. Open **Start Orbit.cmd**. Orbit resolves ZEIRON-CORE or its saved trusted address on the home LAN.
5. Open Orbit Host on Zeiron and select **Link Legion Go**. Paste the temporary code into **Link Zeiron** on the handheld. Keep the code out of GitHub, logs, and chat.
6. Orbit reuses valid existing streaming trust or coordinates normal PIN pairing internally. A temporary engine pairing window may appear; no manual backend configuration is required.
7. When Zeiron shows **Online**, select **Desktop** and press **Connect**.

Zeiron must allow Orbit's authenticated TCP 38742 control channel from the Legion Go, in addition to the existing streaming ports. Firewall changes require separate approval on Zeiron. The optional loopback preview at 127.0.0.1:38741 is unrelated to streaming.

## Daily use

Trust persists in a local encrypted device registry. Choose Desktop or the optional Steam Big Picture intent, then Connect. Orbit minimizes only after the host observes the stream connection. Normal stream closure returns to Orbit. Unexpected termination triggers up to three recovery attempts; intentional Disconnect cancels them and leaves the host application running.

| Profile | Resolution | Frame rate | Bitrate |
|---|---|---|---|
| Balanced | 1920 × 1200 | 60 fps | 20 Mbps |
| Smooth | 1920 × 1200 | 120 fps | 35 Mbps |
| Sharp | 2560 × 1600 | 60 fps | 35 Mbps |

Profiles describe requests to the streaming engine and need testing on the actual display and network.

## Local data and isolation

The sandboxed Orbit renderer has no Node access or arbitrary command endpoint. Device trust and profiles live under ignored `data/launcher/`; the engine retains streaming pairings in its portable `moonlight/` directory. Never commit device registries, pairing keys, invitations, credentials, or logs.

No startup service, driver, router change, firewall rule, or global controller mapping is installed by the client. Closing Orbit stops its owned processes.

`Start Simulator.cmd` runs the isolated legacy interface simulator with separate `data/simulator/` settings. It does not test the current control plane, decode video, or establish a real connection.

## Acceptance test on the handheld

1. Link once, close and reopen Orbit, and confirm Zeiron returns Online without another code.
2. Connect to Desktop directly from Orbit; confirm moving picture and host audio.
3. Test physical sticks, buttons, and triggers in a controller-capable host application. A detected controller in Orbit alone does not prove forwarding.
4. End the stream and confirm return to Orbit; Connect again.
5. Briefly interrupt the LAN and confirm bounded recovery. Disconnect during recovery and confirm it stays stopped.
6. Report the Orbit state and visible error if any step fails, without sharing credentials.

Automated coordinator, TLS, native UI, and real isolated engine-pairing checks have passed. Picture, audio, physical input, and recovery on the Legion Go remain unverified for this updated architecture.

## Components

Electron 44.5.1 and Moonlight 6.2.0 are portable official releases with verified archive SHA-256 hashes. Original licenses remain in their distributions. Neither streaming engine is forked or modified.
