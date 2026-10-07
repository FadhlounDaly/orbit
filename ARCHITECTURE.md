# Orbit control plane

This is personal software for **Zeiron (host)** and **Legion Go (client)**. There are no accounts, arbitrary host enrollment, or public-service dependencies.

## Ownership

| Responsibility | Owner / module |
|---|---|
| Persistent device identity and trust | Orbit `control/model.cjs`, encrypted device registry |
| Host discovery | Orbit `ClientCoordinator.locate`: stored LAN address, persistent ZEIRON-CORE hostname, existing address preference |
| Linking and backend pairing orchestration | Orbit coordinator and `HostService`; Moonlight/Sunshine retain their cryptographic streaming pairing |
| Host configuration | Orbit `HostBackend`; isolated apps, ports, credentials and runtime |
| User intents and session definitions | Orbit `SESSIONS`: `desktop` and `steam` |
| Connection/recovery state | Orbit `Machine` and `ClientCoordinator` |
| Moonlight invocation | Only `MoonlightAdapter`, fixed list/pair/stream operations and allowlisted targets |
| Sunshine observation | Only host backend/control service; authenticated local API plus incremental connection events from its log |
| Streaming protocol, decode, audio, controller transport | Unmodified Moonlight |
| Capture, encode, input injection and application streaming | Unmodified Sunshine |
| UI | Orbit native client and host windows |

The renderer receives Orbit states and session IDs. It cannot execute commands, select executables, address backend administration APIs, or choose arbitrary Sunshine application IDs.

## Connection state

`UNKNOWN → DISCOVERING → HOST_FOUND → UNPAIRED → PAIRING → TRUSTED → READY → CONNECTING → STREAMING`

Known trust skips UNPAIRED/PAIRING. Discovery failures produce OFFLINE; explicit identity changes produce ERROR and require deliberate linking. Normal session closure returns READY. Unexpected termination produces RECONNECTING, with at most three retries (1/3/8 seconds). User disconnect and app shutdown cancel retries. Invalid transitions throw rather than silently setting booleans.

An engine process starting is **CONNECTING**, not STREAMING. STREAMING requires a fresh host-side control-channel connection observation during the current Orbit lease. This establishes protocol connection; it is not proof that picture, sound, or physical input has been manually validated.

## Personal device registry

Each device generates its identity once. The Legion Go retains one preferred Zeiron host record with its certificate fingerprint, opaque device token, hostname and last address. Zeiron retains one trusted Legion Go identity. Registries are protected with Electron safeStorage / Windows DPAPI and ignored by Git. A changed LAN address is updated only after authenticated communication with the stored host identity.

Discovery is resolution of the explicit personal-device registry, not network-wide scanning or a generic host picker.

## First-time linking

1. Start Orbit Host and select **Link Legion Go**.
2. Orbit produces a five-minute, single-use invitation containing Zeiron's identity, certificate fingerprint and a random 256-bit invitation secret.
3. Paste it in **Link Zeiron** on the Legion Go.
4. Orbit verifies the actual TLS peer certificate before transmitting the invitation or device token. The host consumes the invitation and issues a separate device token.
5. If the streaming engine is already paired with this host, Orbit preserves it. Otherwise the adapter invokes stock Moonlight's pair command with an internally generated PIN, and the authenticated host service approves only the request from that client's network address.
6. Orbit verifies streaming trust through the engine before moving to READY. Streaming certificates remain in the original backend stores; no keys are copied between machines.

No password is sent to an unverified TLS peer. Invitations and device tokens are never logged. Native APIs reject browser-origin requests, arbitrary session targets, replayed invitations and expired leases.

The stock Moonlight CLI pair operation owns a Qt pairing window; Orbit starts and completes it without manual backend operation and closes its owned pairing process after trust is verified. This adapter seam needs physical-device verification; backend branding during that temporary engine operation has not been eliminated by a fork or UI automation.

## Orbit sessions

A session is a user intent (`desktop` or `steam`), selected profile, Orbit lease, and observed lifecycle. Host-local mapping selects Desktop or Steam Big Picture internally. Clients see only Orbit intents.

The host authorizes one session lease for its one trusted client. Heartbeats renew it; leases expire after 45 seconds without control-plane activity. Recovery presents the previous lease ID rather than creating competing sessions. Normal end releases the lease but leaves the host application running. No arbitrary command API is exposed.

## Network boundary

Streaming uses existing Moonlight/Sunshine ports. Orbit adds an authenticated, certificate-pinned HTTPS control channel on **TCP 38742**. Sunshine management remains restricted to the PC and is not exposed through Orbit. UPnP stays disabled.

For this installation, allow TCP 38742 for Orbit.exe only from the Legion Go's current LAN IP. This is a separate, explicit firewall approval; existing streaming rules do not cover it.

## Validation and limits

`node --test tests/*.test.cjs` covers transition legality, identity mismatch, trust persistence, duplicate Connect, connection observation, recovery cancellation/limits, certificate pinning before secret transmission, invitation consumption, fixed sessions and host safety. TLS tests use ephemeral OpenSSL-generated certificates; they skip if OpenSSL is unavailable.

Native UI tests use an isolated copy and mock host replies; they do not claim a physical stream. An actual Legion Go acceptance run must cover linking, repeated Connect, loss/recovery, intentional disconnect, picture/audio/controller behavior and returning to Orbit.

No backend was forked. No driver, startup service, router setting or broad firewall rule is installed.
