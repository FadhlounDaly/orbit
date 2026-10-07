# Orbit Host

Orbit now has a native host interface on the gaming PC and a handheld interface on the Legion Go. Sunshine captures and streams the desktop; Moonlight receives it. Cortex is not a dependency of the new host.

## Gaming PC setup

1. Review and run `Setup Orbit Host.ps1`. It downloads portable Sunshine v2026.914.233613 from the official LizardByte release and checks SHA-256 before extraction. The Electron runtime is shared with the handheld launcher.
2. Open **Start Orbit Host.cmd**; hosting starts automatically.
3. Stop any existing Cortex/Sunshine hosting session before opening Orbit Host. Orbit refuses occupied ports and never stops another host automatically.
4. Desktop is shared by default. Before starting, optionally select Steam Big Picture and save shared apps.
5. On the Legion Go, open Orbit. It resolves Zeiron from its saved address or ZEIRON-CORE.
6. Select Link Zeiron on the handheld and enter its four-digit code in the pending request in Orbit Host. Orbit coordinates pairing and verifies trust.
7. When Orbit shows Zeiron Online, choose a game and Play on Legion Go, or use Your PC → Desktop.

Select Stop hosting to stop streaming while the Orbit control channel remains available. Closing Orbit Host restores its session state before stopping the owned backend. No startup service is registered.

Read [ARCHITECTURE.md](ARCHITECTURE.md) for the current control-plane model.

## Local security and networking

- Standard streaming base port: TCP 47989; TLS 47984; RTSP 48010.
- Sunshine’s management interface on 47990 accepts only this PC. It requires a unique random management password.
- Orbit uses the locally generated Sunshine certificate as its trust root when calling the loopback management API; certificate verification remains enabled.
- Management credentials are encrypted with Electron safeStorage (Windows DPAPI). They are never passed to the renderer, logged, placed in process arguments, or committed.
- Orbit links the two device identities through pinned HTTPS on TCP 38742, then coordinates streaming PIN approval through the documented engine API. No pairing certificates are imported from another device.
- Profiles, pairing keys, certificates, encrypted management credentials, and diagnostics live under ignored `data/host/`. Downloaded binaries live under ignored `backend/`.
- UPnP is disabled. Setup does not modify firewall rules, router settings, drivers, Windows execution policy, or existing services.
- If firewall access is required, approve only the intended local-network access after reviewing the proposed rule. Orbit does not add one.
- The lite Sunshine bundle does not install controller drivers. Run `Setup Orbit Controllers.ps1` once on Zeiron to install the verified controller forwarding driver. Windows approval is for this one-time driver setup.

## Migration from Cortex

Pair this new host freshly; Cortex’s existing pairings are not reused. Keep Cortex installed until an actual Desktop stream is validated, then decide separately whether to uninstall it. Avoid running both hosts on the same ports. If Cortex’s ports were changed earlier for Orbit, that configuration is independent of this new backend.

## Validation

Run `node --test tests/host-backend.test.cjs` for port-conflict refusal, protected credential requirements, pending-PIN validation, pairing-result handling, and shared-app safety. Hardware streaming, audio, controllers, and the physical Legion Go require an actual paired stream; automated tests do not establish that result.

The older `host/` folder is a loopback browser preview and is not used by the native Orbit Host.

## Installed game library

The host owns discovery and launch targets for Steam, registered Xbox PC games, and unambiguous standalone PC executables. No per-game Sunshine entry is required: games run on Zeiron and use the existing Desktop stream. Xbox launch uses the registered Windows application target rather than bypassing its normal launch flow. Disconnecting the stream leaves the game running. Store launch acceptance and a standalone process starting do not guarantee a game's menu is ready; check the streamed picture.

Artwork from installed files and the public Microsoft catalog is cached locally; network failures preserve installed art. Library and game details require the already-linked client credential over pinned HTTPS. Update both Orbit Host and the handheld client for library browsing and Play. Device trust and streaming pairings survive source updates.

Emulated games use host-owned profiles in `data/host/library-profiles.json`. A Ryujinx profile names a local root, relative executable, ROM, data directory, and optional artwork. Orbit validates those paths under the root and sends only the opaque game ID from the handheld. The existing save directory is retained. Windows forced administrator compatibility can block direct launches; Orbit reports that failure rather than elevating the host.

Handheld sessions temporarily fit the primary monitor to a supported mode near the chosen profile (1920×1200 for Balanced). Orbit saves the original display mode before changing it and restores it when the session ends, including failed launches and recovery after a host restart. Games start as the signed-in user; Play does not open an administrator approval window. Games that genuinely require administrator-only setup must complete that setup on Zeiron first.
