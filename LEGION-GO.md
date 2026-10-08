# Orbit on Legion Go

Orbit is the personal client for Zeiron. It owns device linking, session selection, connection state, and recovery; its bundled streaming engine handles picture, sound, and controller transport.

## Update the existing installation

1. Close Orbit and any active stream.
2. In `C:\Apps\Orbit`, inspect local changes before updating from the reviewed Git branch. Preserve `data/`, `moonlight/`, and `runtime/` binaries; do not reset or delete local pairing data.
3. Read `README.md`, `ARCHITECTURE.md`, and the setup script before running setup. Setup downloads verified portable dependencies if needed. Do not weaken Windows execution policy.
4. Open **Start Orbit.cmd**. Orbit resolves ZEIRON-CORE or its saved trusted address on the home LAN.
5. Select **Link Zeiron** on the handheld, then enter its four-digit code into the pending request in Orbit Host on Zeiron. Keep the code out of GitHub, logs, and chat.
6. Orbit reuses valid existing streaming trust or coordinates normal PIN pairing internally. A temporary engine pairing window may appear; no manual backend configuration is required.
7. When Zeiron shows **Online**, select **Desktop** and press **Connect**.

Zeiron must allow Orbit's authenticated TCP 38742 control channel from the Legion Go, in addition to the existing streaming ports. Firewall changes require separate approval on Zeiron. The optional loopback preview at 127.0.0.1:38741 is unrelated to streaming.

## Daily use

Trust persists in a local encrypted device registry. Choose a game and Play; use Your PC for Desktop or optional Steam Big Picture. Orbit minimizes only after the host observes the stream connection. Normal stream closure returns to Orbit. Unexpected termination triggers up to three recovery attempts; intentional Disconnect cancels them and leaves the host application running.

| Profile | Resolution | Frame rate | Bitrate |
|---|---|---|---|
| Balanced | 1920 × 1200 | 60 fps | 20 Mbps |
| Smooth | 1920 × 1200 | 120 fps | 35 Mbps |
| Sharp | 2560 × 1600 | 60 fps | 35 Mbps |

Profiles request stream quality and a supported handheld-shaped Windows display mode. Orbit restores Zeiron’s original display mode after the session. Controller forwarding needs the one-time host driver setup; the client streams gamepad input to an Xbox controller on Zeiron.

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

## Launcher controls

D-pad/stick moves focus; A plays the focused game or activates a control; B backs out; X opens search; Y refreshes the library; LB/RB switches Library/Your PC; Menu opens settings. Touch selects a cover, then Play starts it. Arrow keys and Enter also work.

The library comes from Zeiron, including registered Xbox PC titles, Steam, and supported standalone PC games. Xbox games without a valid Windows registration are marked for host setup. Emulators, ambiguous executables, and installers are not automatically treated as game launch targets. Other launcher providers are not currently imported.

During play, tap the top-right **Orbit · Menu** badge. **Resume** returns to the game; **End stream** closes Orbit’s streaming process and returns to the library while leaving the game open on Zeiron. With the menu focused, controller **B** resumes and **A** ends the stream; the streaming window receives gamepad input while it has focus. Keyboard shortcut: **Ctrl+Alt+O**. The badge does not take focus during normal play.

### Orbit 0.9 game sessions

Update both Zeiron and the handheld to `orbit-discover-and-link`. A game session's Orbit menu now offers **Close game**, which requests a normal exit on Zeiron before ending the stream. If the game asks to save or confirm exit, resolve that dialog in the stream and retry. Desktop sessions offer **End Desktop** and do not close host applications.

Orbit tracks newly started game windows under the host's configured game installation. Once the observed game processes exit, the handheld returns to its library instead of reconnecting to an empty desktop. Detection happens on session polling; a brief desktop transition is still possible. Games with launchers that move outside their installation directory may require further provider-specific tracking. Preexisting host games are deliberately not closed.

Xbox activation can open cloud-save, sign-in, or launcher dialogs before gameplay. Orbit keeps the stream available to make those choices on the handheld. It does not select or overwrite a save automatically.

For Zeiron's Yuzu EA Xbox 360 controller bindings, close Yuzu and run `node scripts/repair-yuzu-input.cjs` locally. This backs up its configuration and repairs raw SDL buttons and D-pad hats. Keyboard bindings are a separate Yuzu input profile; this repair configures the streamed controller.

### Orbit 0.9.1 input focus fix

Controller forwarding remains enabled when the streaming window loses focus, including during the Orbit launch handoff. Update the physical handheld and fully restart its Orbit app for this change to affect Moonlight's launch options. The session menu also receives controller input, so pressing its buttons may send that button to the game while the menu is open; touch is preferable for Close game until forwarding can be paused through a supported runtime API.

Yuzu's selected Player 1 controller profile replaces gameplay keyboard mappings. To test Zelda locally with the keyboard, close Yuzu and run `node scripts/repair-yuzu-input.cjs --keyboard` on Zeiron. Arrow keys navigate, **C** is A, **X** is B, **Q/E** are L/R, and **WASD** moves. Restore streaming controls with `node scripts/repair-yuzu-input.cjs` while Yuzu is closed. Both modes back up the prior configuration and explicitly connect Player 1 as a Pro Controller. Do not run either repair while Yuzu is open; it can overwrite externally edited settings on exit.

### Orbit 0.10 host overview

**Your PC** shows Zeiron's CPU model and load, total and used RAM, primary graphics card and driver, streaming readiness, uptime, and control-request response time. It refreshes in place with the existing 15-second status poll. Offline information is clearly labeled last known, and live measurements are unavailable. The response time measures Orbit's control request, not video latency. GPU load, GPU memory, and temperatures are not fabricated; live GPU usage is explicitly unavailable. Graphics inventory uses a cached read-only Windows query and requires no administrator access. Hardware information is available only to a linked handheld.

### Orbit 0.11 launch and exit cover

Game sessions place a non-interactive Orbit cover behind the game on Zeiron. It is created before the game launches, follows monitor resolution changes, and remains during game shutdown until Sunshine reports the client disconnected. It never takes controller or keyboard focus. Explicit Desktop sessions clear the cover. Other applications or system dialogs can still appear above this ordinary window; this is a transition cover, not isolated game-window capture.

Close game allows up to 12 seconds for a normal Windows exit, while keeping the stream available for confirmation dialogs. It does not force-kill the game.

The LEGION-GO Hyper-V VM was updated and tested with the production launcher, native Skyrim streaming, and Close game returning to the library. The VM requires a signed-in interactive Windows desktop. Its temporary Orbit link replaces the physical handheld's link; link the physical Legion Go again when returning to it. Zeiron's `Orbit-VM-Simulation-TCP` and `Orbit-VM-Simulation-UDP` firewall rules are limited to Orbit's Sunshine executable and the VM's current Default Switch address. Remove these two rules when VM simulation is finished; update their addresses if Hyper-V changes the VM subnet. VM testing does not establish physical controller behavior or prove zero desktop frames across all games and system dialogs.
