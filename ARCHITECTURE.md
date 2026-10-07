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
| Streaming runtime invocation | `control/moonlight.cjs` MoonlightAdapter |
| Video/audio/input transport | Stock Moonlight and Sunshine |
| Rendering and user input | Sandboxed Orbit windows; no orchestration in renderer code |

The host accepts an intent and profile ID, validates them, prepares the session, and returns the internally mapped stream target and approved profile. The client invokes its adapter only after host readiness. The protocol retains the legacy session response shape so already-linked clients can connect using the default Balanced profile during migration. Both sides must update for new enrollment.

## Eight-digit enrollment

The host generates a cryptographically random eight-digit code, including leading zeroes. It expires after five minutes, is used once, and stays in memory. Regeneration invalidates outstanding challenges without resetting the host-wide attempt budget: five starts per minute, ten per invitation, at most three simultaneous challenges, each lasting at most thirty seconds. Restart clears invitations and challenges.

Enrollment uses SRP-6a with the HomeKit 3072-bit/SHA-512 parameters from unmodified `fast-srp-hap` 2.0.4. The vendored npm archive was checked against SHA-512 integrity; its MIT license and provenance are retained. This uses a published implementation, not custom SRP arithmetic, and does not claim an independent audit of Orbit's protocol integration.

The code is never sent over the network. The peers exchange public SRP values and verify key-confirmation proofs. The host seals the identity, client ID, TLS fingerprint and new random 256-bit credential using AES-256-GCM with an HKDF-derived key and challenge-bound associated data. The client verifies the server proof, decrypts the envelope, and verifies the actual TLS certificate before transmitting its credential or persisting trust. An unauthenticated TLS transport is permitted only for nonsecret discovery and SRP enrollment messages, not ordinary authenticated operations.

Future operations use the separate credential over pinned HTTPS. Device registries use Windows DPAPI. The eight-digit code is never a permanent password. Existing registry credentials remain valid across this update.

Local host UI can remove Orbit trust only when there is no active session. This immediately invalidates Orbit API access and cancels enrollment. Streaming-engine pairing is a separate relationship and is preserved; this control-plane operation is not a claim of backend certificate revocation.

## Host session lifecycle

`IDLE → PREPARING → CONFIGURING_DISPLAY → PREPARING_STREAM → READY → STREAMING`

Connection loss enters RECONNECTING. A validated resume keeps the session identity. Ending enters ENDING then RESTORING then IDLE. A restoration failure enters ERROR and blocks new sessions until restoration succeeds. All lifecycle operations are serialized in one manager.

A session records its client identity, intent, profile, start time, heartbeat, and previous system state. The restoration journal is written atomically under ignored `data/host/` before any display preparation. Startup replays unfinished restoration. Graceful shutdown awaits restoration before stopping the owned backend. A periodic host tick expires sessions without relying on client/UI polling; expired heartbeats cannot revive them.

Current display policy explicitly preserves the physical monitor. The PreserveDisplay adapter makes no Windows changes. Journal ordering, restoration failures and crash recovery are verified with injected display adapters; they do not establish working Windows display switching. The lifecycle is ready for a separately tested Windows DisplayManager. It does not yet launch or monitor game processes.

STREAMING is based on fresh host-side protocol connection events, never merely process startup. Sunshine's current log events do not attribute the connection to an Orbit device. This remains a single-client installation assumption, not authenticated attribution or proof of picture/audio/controller health. Ending a lease does not forcibly quit the host application or revoke the engine's pairing.

## Host API and observations

Nonsecret `/identity`; SRP `/enrollment/begin` and `/enrollment/finish`; authenticated `/status`, `/pair-stream`, `/sessions/start`, `/sessions/heartbeat`, `/sessions/end`, `/sessions/state`. Fixed intents are Desktop and optional Steam Big Picture. No executable, script or shell-command endpoint exists.

Host status separates command-center availability from streaming readiness. Once the local certificate exists, the control service can start before Sunshine and remains reachable when streaming is stopped or fails. First installation still obtains the initial certificate from the owned engine. Explicit backend health is based on management API success, not just process existence.

SystemObserver reports host name, uptime, sampled CPU utilization, RAM and IPv4 interfaces. GPU metrics, temperatures, active user, foreground application and running game are explicitly unavailable/null until reliable adapters exist. Renderers never infer them.

## Next capabilities

| Capability | Next implementation boundary |
|---|---|
| GameLibrary | Extract read-only Steam discovery from legacy `host/server.cjs`; normalize host-owned IDs, then add launcher providers |
| GameLaunchManager | Fixed library launch targets, process confirmation and failure reporting; no remote paths or commands |
| DisplayManager | Enumerate supported modes, identify monitor, snapshot/apply/restore with durable recovery; reject unsupported modes |
| Virtual display | Investigate an existing maintained Windows-compatible solution before choosing any driver; no custom driver |
| Per-game profiles | Host-owned intent/display/stream mappings; do not edit game graphics settings |
| PowerManager | Explicit lock/sleep/restart/shutdown with intentional UI actions; separate Wake-on-LAN model |
| AudioManager | Observe first; reversible output/mute policy with restoration later |
| Controller awareness | Report backend/input health without replacing transport |

Legion Native, Performance and Battery display intents belong to the host policy layer once a real display adapter is available. Current Balanced/Smooth/Sharp profiles remain stream requests only; they do not claim the Windows capture display has changed.

## Security, testing and deployment

TCP 38742 is the certificate-pinned authenticated control channel. Existing program-specific LAN firewall access is sufficient; no new rule is introduced by this update. Sunshine management stays local-only, UPnP disabled. Setup installs no driver, startup service or router changes.

`node --test tests/*.test.cjs` verifies enrollment proofs, replay/expiration/limits, TLS pinning before credential transmission, device trust removal, host serialization, profile validation, restoration ordering/replay/failure, expiry, fresh streaming observation and client recovery. TLS tests need OpenSSL and skip without it. Mock native UI checks and isolated real engine pairing are separate from physical Legion Go stream acceptance.

The legacy simulator and loopback preview remain separate. They are not validation of this host controller. Device data, certificates, credentials, journals and logs stay out of Git.
