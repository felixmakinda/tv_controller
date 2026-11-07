# Architecture

```text
 apps/mobile (Expo / React Native)
 ┌──────────────────────────────────────────────────────────────┐
 │ UI (src/app — Expo Router)   Voice (src/voice)   Keyboard     │
 │        │                         │                            │
 │        └────── useCommandRunner / pressKey (src/commands) ────┤
 │                         │                                     │
 │   @tvc/command-engine:  parseLocal ─▶ (LLM, Phase 3) ─▶ Zod    │
 │                         │            validation               │
 │                         ▼                                     │
 │                     dispatch()  ◀── the ONLY path to a TV     │
 │      resolveTargets · capability gate · confirmation ·        │
 │      per-step & per-device honest status                      │
 │                         │                                     │
 │   src/devices: registry ─▶ connection manager (sessions,      │
 │                            reconnect/backoff)                 │
 │                         │                                     │
 │   @tvc/device-contracts: TVDeviceAdapter / DeviceSession      │
 │        │                   │                                  │
 │   @tvc/samsung-protocol   MockAdapter (Demo TV)    (future:   │
 │        │                                     android-tv, lg,  │
 │        │                                     roku adapters)   │
 │        ▼                                                      │
 │   Transports interface ─▶ src/connectivity ─▶ modules/tv-native│
 │                           (fetch, TOFU WebSocket, SSDP, WoL)  │
 └──────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Responsibility | Runtime deps |
|---|---|---|
| `@tvc/device-contracts` | Adapter/session interfaces, capabilities, remote keys, errors, transport interfaces | none |
| `@tvc/command-schemas` | Zod schemas for every intent; `validateIntent` for untrusted (LLM) output | zod |
| `@tvc/command-engine` | Local parser, device resolution, dispatcher, media-search interface | contracts, schemas |
| `@tvc/samsung-protocol` | Samsung Tizen adapter: message builders, pairing, session | contracts |

`shared-types` from the original spec was folded into `device-contracts` (a separate package would have been empty). `command-engine` was added so command logic is testable without React Native.

## Key decisions

1. **Protocols are runtime-agnostic.** Adapters receive a `Transports` object (`socket`, `http`, `lan`). The mobile app injects native implementations; tests inject fakes; the future gateway injects Node ones. No adapter imports React Native.
2. **Sessions, not device IDs.** `adapter.connect()` returns a `DeviceSession`. Power-on lives on the adapter, because the TV's control channel is down when it's off.
3. **Keys are one method.** `sendKey(RemoteKey)` replaces ~20 per-button methods; `KEY_CAPABILITY` maps keys to capabilities for UI gating.
4. **Capabilities are tri-state** (`supported` / `unsupported` / `unknown`). `unknown` means "allowed to try; the adapter reports the real result". The UI hides `unsupported` controls.
5. **Honest outcomes.** `sent` (fire-and-forget) < `acknowledged` (TV replied) < `confirmed` (state readback). Multi-step commands report each step (`search`, `select_content`, `send_command`), so "found it" is never presented as "playing".
6. **AI is an optional producer of intents.** It can only emit objects that pass `CommandIntentSchema`; it never calls adapters, the network or the OS directly.
7. **Apps without a catalogue API** (Netflix etc.): the dispatcher opens the app and returns a `followUp`, so the UI offers the phone keyboard pre-filled with the query.

## Data

| Data | Where |
|---|---|
| Saved devices (name, room, host, model, MAC) | SQLite kv-store (`devices`) |
| Settings | SQLite kv-store (`settings`) |
| Pairing tokens, API keys | `expo-secure-store` (Android Keystore) |
| TLS certificate pins | Native SharedPreferences (`tv_native_cert_pins`) |
| YouTube search cache (24 h) | SQLite kv-store |

## Adding a manufacturer

1. Create `packages/<brand>-protocol` implementing `TVDeviceAdapter` against `Transports`.
2. Unit-test it against fixtures taken from a maintained reference implementation.
3. Register it in `apps/mobile/src/devices/registry.ts`.
4. If it needs a new transport primitive, add it to `Transports` and implement it in `tv-native`.

The command engine and UI need no changes.
