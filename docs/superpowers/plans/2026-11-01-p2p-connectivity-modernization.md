# P2P Connectivity Modernization Implementation Plan

**Goal:** Restore use of supported free public Iroh relays and improve route reporting without paid infrastructure.

**Architecture:** Upgrade Iroh 0.92.0 to 1.4.1, move tickets to `iroh-tickets` 1.0.0, use the N0 preset, generate EL2 invitations, retain compatible EL1/short-code parsing, and confirm relay connectivity within a 12-second bound.

**Spec:** `docs/superpowers/specs/2026-11-01-p2p-connectivity-design.md`

## Constraints
- Only `ui-fidelity-pass`; no new branch and no push to `main`.
- No VPS, hosted proxy, paid relay, or new external service.
- Preserve globe icon, Tauri command names, invite flow, and localhost game connection.
- Do not alter workflow definitions, secrets, or repository settings.
- Do not claim Kazakhstan ↔ Russia works before a two-network live test.

## Review focus
- EL2 ticket and Endpoint ID parse without delimiter loss.
- EL1 TCP and legacy short-ID paths still parse.
- Malformed tokens fail clearly.
- Relay timeout preserves direct addresses and never reports an unconfirmed relay.

## Tasks
### 1. Invitation regression tests
- [ ] Test EL2 TCP + EndpointTicket + EndpointId parsing.
- [ ] Test EL1 direct TCP, short EndpointId codes, and malformed keys.
- [ ] Run `cd src-tauri && cargo test --features p2p p2p::imp::tests`; verify EL2 fails on the old parser before implementation.

### 2. Iroh migration
- [ ] Pin `iroh = "=1.4.1"` and add optional `iroh-tickets = "=1.0.0"`.
- [ ] Use `Endpoint::builder(presets::N0)` and `proxy_from_env()` on host and guest.
- [ ] Use `EndpointAddr`, `EndpointId`, and `EndpointTicket`; generate EL2 and retain compatible legacy routes.
- [ ] Run P2P-enabled tests and `cargo test --no-default-features`.

### 3. Relay readiness and UI
- [ ] Bound `Endpoint::online()` to 12 seconds; return the latest address on timeout.
- [ ] Make `has_relay` represent a confirmed relay connection.
- [ ] Update UI wait estimates and relay status wording.
- [ ] Run `node --check src/main.js` and `node scripts/check-ui.mjs`.

### 4. Build verification
- [ ] Inspect the existing Windows test-build run for the exact commit; do not edit workflow files.
- [ ] Confirm default-feature P2P compiles and the installer artifact exists.
- [ ] Report the Kazakhstan ↔ Russia live-test requirement.
