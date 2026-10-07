# Orbit host controller

Orbit is personal software for Zeiron and the Legion Go. It has no accounts, tenant model, public enrollment service, or arbitrary remote command endpoint. Moonlight and Sunshine remain unmodified streaming infrastructure.

## Ownership

| Responsibility | Component |
|---|---|
| Persistent identity and encrypted registry | `control/model.cjs` |
| Enrollment, device credential issuance, metadata and Orbit trust removal | `control/devices.cjs` DeviceManager |
| Personal host resolution and client connection recovery | `control/client.cjs` ClientCoordinator |
| Semantic authenticated API | `control/host-service.cjs` HostService |
| Host preparation, session identity, expiration, recovery and restoration | `control/host-sessions.cjs` SessionManager |
| Streaming observations | StreamObserver behind the host session controller |
| Streaming process, isolated configuration and local management API | `host-backend.cjs` HostBackend |
| Structured machine sampling | `control/system-observer.cjs` SystemObserver |
| Installed Steam/Xbox/PC game catalog and artwork | `control/game-library.cjs` GameLibrary |
| Fixed host-owned game launch targets | `control/game-library.cjs` GameLaunchManager |
| Streaming runtime invocation | `control/moonlight.cjs` MoonlightAdapter |
| Video/audio/input transport | Stock Moonlight and Sunshine |
| Rendering and user input | Sandboxed Orbit windows; no orchestration in renderer code |

The host accepts an intent and profile ID, validates them, prepares the session, and returns the internally mapped stream target and approved profile. The client invokes its adapter only after host readiness. The protocol retains the legacy session response shape so already-linked clients can connect using the default Balanced profile during migration. Both sides must update for new enrollment.

## Handheld-code enrollment

The handheld generates a random four-digit code and creates a two-minute pending request. The user enters the code in Orbit Host on Zeiron. Approval allows one SRP-6a proof attempt, with a thirty-second proof window, and does not directly establish trust. Enrollment uses the published HomeKit 3072-bit/SHA-512 implementation in unmodified `fast-srp-hap` 2.0.4. The code is never sent over the network. Peers exchange SRP public values and verify key-confirmation proofs; the host seals its identity, TLS fingerprint and a separate random 256-bit credential using AES-256-GCM and HKDF. Ordinary authenticated operations use pinned HTTPS and the separate credential. Device registries use Windows-protected storage in each app's existing profile. Three requests per minute are allowed, with one pending request at a time.

Local host UI can remove Orbit trust only when there is no active session. This immediately invalidates Orbit API access and cancels enrollment. Streaming-engine pairing is a separate relationship and is preserved; this control-plane operation is not a claim of backend certificate revocation.

## Host session lifecycle

`IDLE → PREPARING → CONFIGURING_DISPLAY → PREPARING_STREAM → READY → STREAMING`

Connection loss enters RECONNECTING. A validated resume keeps the session identity. Ending enters ENDING then RESTORING then IDLE. A restoration failure enters ERROR and blocks new sessions until restoration succeeds. All lifecycle operations are serialized in one manager.

A session records its client identity, intent, profile, start time, heartbeat, and previous system state. The restoration journal is written atomically under ignored `data/host/` before any display preparation. Startup replays unfinished restoration. Graceful shutdown awaits restoration before stopping the owned backend. A periodic host tick expires sessions without relying on client/UI polling; expired heartbeats cannot revive them.

The Windows display adapter snapshots the primary monitor mode to the session journal before changing it. It selects a supported mode close to the handheld profile and restores the exact previous mode on disconnect, failure, shutdown or recovery after a crash. It changes neither monitor topology nor global display preferences. Non-Windows/testing sessions retain PreserveDisplay. Store launches report REQUESTED; standalone launches report PROCESS_STARTED after spawn, with normal user permissions and no ShellExecute elevation fallback. These states do not prove that game video or input is healthy. Games are not terminated when a stream ends.

STREAMING is based on fresh host-side protocol connection events, never merely process startup. Sunshine's current log events do not attribute the connection to an Orbit device. This remains a single-client installation assumption, not authenticated attribution or proof of picture/audio/controller health. Ending a lease does not forcibly quit the host application or revoke the engine's pairing.

## Host API and observations

Nonsecret `/identity`; SRP `/enrollment/begin` and `/enrollment/finish`; authenticated `/status`, `/pair-stream`, `/sessions/start`, `/sessions/heartbeat`, `/sessions/end`, `/sessions/state`, `/library`, `/library/game`. Fixed intents are Desktop and optional Steam Big Picture. No executable, script or shell-command endpoint exists.

Host status separates command-center availability from streaming readiness. Once the local certificate exists, the control service can start before Sunshine and remains reachable when streaming is stopped or fails. First installation still obtains the initial certificate from the owned engine. Explicit backend health is based on management API success, not just process existence.

SystemObserver reports host name, uptime, sampled CPU utilization, RAM and IPv4 interfaces. GPU metrics, temperatures, active user, foreground application and running game are explicitly unavailable/null until reliable adapters exist. Renderers never infer them.

## Next capabilities

| Capability | Next implementation boundary |
|---|---|
| GameLibrary | Implemented for installed Steam games, registered Xbox PC games, and unambiguous standalone executables directly in local Games folders; add other providers separately |
| GameLaunchManager | Implemented fixed Steam/Xbox/PC targets with request/process-start reporting; add reliable game-ready/process observation separately |
| DisplayManager | Enumerate supported modes, identify monitor, snapshot/apply/restore with durable recovery; reject unsupported modes |
| Virtual display | Investigate an existing maintained Windows-compatible solution before choosing any driver; no custom driver |
| Per-game profiles | Host-owned intent/display/stream mappings; do not edit game graphics settings |
| PowerManager | Explicit lock/sleep/restart/shutdown with intentional UI actions; separate Wake-on-LAN model |
| AudioManager | Observe first; reversible output/mute policy with restoration later |
| Controller awareness | Report backend/input health without replacing transport |

Balanced/Smooth/Sharp profiles also guide the Windows capture display during a session. Only advertised, handheld-shaped modes are used; the original mode is restored afterward.

## Security, testing and deployment

TCP 38742 is the certificate-pinned authenticated control channel. Existing program-specific LAN firewall access is sufficient; no new rule is introduced by this update. Sunshine management stays local-only, UPnP disabled. Base setup installs no driver, startup service or router changes. The separate Setup Orbit Controllers.ps1 installs the pinned, signature-checked ViGEmBus driver on the host for Xbox controller forwarding.

`node --test tests/*.test.cjs` verifies enrollment proofs, replay/expiration/limits, TLS pinning before credential transmission, device trust removal, host serialization, profile validation, restoration ordering/replay/failure, expiry, fresh streaming observation and client recovery. TLS tests need OpenSSL and skip without it. Mock native UI checks and isolated real engine pairing are separate from physical Legion Go stream acceptance.

The legacy simulator and loopback preview remain separate. They are not validation of this host controller. Device data, certificates, credentials, journals and logs stay out of Git.

## Handheld launcher and game ownership

Orbit 0.7 starts in a fullscreen game library, with cover tiles, selected-game artwork, search, provider filters, a secondary PC screen, and controller/keyboard navigation. Healthy background status checks stay READY, use the pinned control channel, and avoid spawning Moonlight list repeatedly. Library updates preserve selection and focus; an offline host leaves the last loaded library visible with Play disabled.

Zeiron discovers Steam manifests and libraries, Xbox registrations and MicrosoftGame.config/AppxManifest.xml, and unambiguous local PC executables in bounded Games folders. Unknown, unregistered, moved, and ambiguous targets are unavailable rather than guessed. The client receives names, provider, opaque game IDs, availability and bounded artwork only. Host paths, package launch targets and command arguments stay private to the host.

Play passes `{intent:'desktop',gameId,profile}` through the existing serialized session API. The host revalidates installation, device authorization and stream readiness, launches the fixed discovered target, and returns Desktop as the stream target. Reconnects retain the same game/session and do not relaunch it. Steam uses its installed executable with numeric app ID; Xbox uses the registered AppsFolder application identity, preserving launcher/anti-cheat entry points; standalone targets use a known executable with a host-owned working directory and no client arguments. No arbitrary shell endpoint exists.

Installed artwork is used offline. Xbox store IDs from local manifests can fetch public Microsoft cover/hero images into ignored `data/host/library-artwork/`. Only Microsoft catalog/image HTTPS origins are accepted; time, response sizes, retries, thumbnail sizes and returned payloads are bounded. Game artwork is not fetched by the renderer. The renderer keeps `nodeIntegration:false`, `contextIsolation:true`, a sandbox, and a local/data-image-only CSP.

Orbit 0.8 journals Skyrim’s managed INI keys before changing them and restores them with the display lifecycle. Yuzu/Ryujinx profiles remain host-owned and keep executable arguments private. The client covers connection setup with its Orbit transition and shows a separate sandboxed, non-focusable stream badge. Only that overlay’s main frame can invoke its menu/end IPC. Ending invokes the existing coordinator disconnect path; it does not terminate the host game. Overlay menus may take focus for controls; the stream does not accept background gamepad input during that focus change. Upstream engines remain unmodified and attributed.
