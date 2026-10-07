# Orbit

Orbit is a Windows launcher for a gaming PC and Lenovo Legion Go. The handheld launcher uses Moonlight to pair with a compatible streaming host. Orbit Host manages a separate Sunshine backend on the gaming PC. The older local preview remains in `host/`.

## Set up the gaming PC

Run `Setup Orbit Host.ps1`, then **Start Orbit Host.cmd**. Orbit provides start/stop hosting, Desktop and optional Steam Big Picture sharing, and approval of pending Moonlight PIN requests. See [HOST.md](HOST.md) for setup, migration, security, and validation.

## Install on the Legion Go

1. Download this repository as a ZIP and extract it to a persistent folder, such as `C:\Apps\Orbit`.
2. Right-click `Setup Orbit.ps1` and select **Run with PowerShell**. The setup downloads pinned Electron and Moonlight releases from their official GitHub repositories and checks SHA-256 hashes before extracting them.
3. Double-click **Start Orbit.cmd**.
4. Select **Set up connection** and enter your gaming PC's local IPv4 address or name.
5. Open Moonlight and complete PIN pairing inside Orbit Host on the gaming PC. Keep both devices on the same LAN.
6. Refresh Orbit and launch an exposed app or Desktop.

If Windows blocks the script, do not disable system-wide execution policy. Review the script and use your normal approved script-running method.

No separate Node installation is required for the handheld. Setup adds no service, startup entry, firewall rule, or router setting.

## Simulator and PC preview

**Start Simulator.cmd** opens an isolated UI simulator. It does not establish a real stream.

The optional PC preview requires Node.js on PATH. Run `host/start-orbit.ps1`; it listens only on `127.0.0.1:38741`. It is not the handheld's streaming server.

See [LEGION-GO.md](LEGION-GO.md) for profiles, limitations, and original validation.

## Source and private state

- `runtime/resources/app/`: Electron launcher source, UI, and original artwork.
- `host/`: local PC preview and read-only host bridge.
- `Setup Orbit.ps1`: handheld dependency download and verification.
- `Setup Orbit Host.ps1`: verified portable Sunshine streaming component.
- `runtime/resources/app/host-*.cjs` and `host-ui/`: native Orbit host management.
- Downloaded runtimes, Moonlight, profiles, caches, and pairing credentials are excluded from Git.
- Each device must complete its own Moonlight pairing; do not copy pairing credentials between devices.

The original app was validated locally. Physical Legion Go pairing, video, audio, and controller behavior still require testing. GitHub distributes Orbit; it does not provide the streaming connection.
