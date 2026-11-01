> **Migration note (2026-11-02):** Preserved from `ui-fidelity-pass` as project history. Checklist items and branch-specific constraints below describe the original planning context; verify current `main` before treating them as outstanding work. Do not follow any instruction here to switch branches or modify `main` without checking the current project state.

# End Launcher P2P connectivity modernization

**Date:** 2026-11-01

## Intent
Improve the existing Minecraft P2P tunnel across countries and home/mobile networks, with Kazakhstan ↔ Russia as an important test case. Keep the globe icon, the room-hosting flow, and one universal invitation code.

## Findings
The implementation pins Iroh 0.92.0 and uses pre-1.0 `NodeTicket`, `discovery_n0()`, `NodeAddr`, and `NodeId` APIs. Public relay service for Iroh 0.9x ended on 2026-09-30, so this build is tied to an obsolete public-relay generation. The three displayed routes are not three independent transports: ticket and ID lookup both use Iroh; direct TCP requires public IPv4 plus UPnP/manual port forwarding.

## Goals
- Upgrade to Iroh 1.4.1 and `iroh-tickets` 1.0.0.
- Use the N0 preset for current public relay defaults and DNS/address lookup.
- Confirm relay connectivity before reporting it as available; preserve direct addresses on timeout.
- Respect explicitly configured HTTP(S) proxy environment variables.
- Keep direct TCP/UPnP as a serverless fallback.
- Generate EL2 invitations while parsing compatible EL1 TCP and legacy short endpoint-ID codes.
- Preserve Tauri command names, the globe icon, the 128-bit room token, encrypted Iroh traffic, and localhost gameplay.

## Limits
- No paid VPS, self-hosted relay, hosted proxy, or new service account.
- No guarantee that every network permits UDP, public relay endpoints, DNS/address lookup, or direct traffic.
- No independent WebSocket/TLS relay: it requires an actual reachable server to forward the stream.
- No changes to `main`, CI workflows, secrets, repository settings, or icon placement.

## Architecture
Use `Endpoint::builder(presets::N0)` with `iroh-tickets::EndpointTicket`. N0 provides current public relay defaults and address lookup. Bound `Endpoint::online()` to 12 seconds; return the latest endpoint address after timeout so direct connections remain possible. Host and guest call `proxy_from_env()` for optional HTTP(S) proxies already configured in the environment.

New codes use `EL2|token|tcp|endpoint-ticket|endpoint-id`. EL1 direct-TCP codes and older short endpoint-ID codes remain parseable. Old 0.9x ticket payloads are not guaranteed compatible; both users should update and generate a fresh room code.

## Security
The random 128-bit token remains required. Iroh provides end-to-end encrypted peer traffic; relays forward encrypted packets. The host forwards only to the selected local Minecraft TCP port. Proxy credentials are never included in room codes or diagnostics.
