# Implementation plan

## Status (2026-11-08)

| Phase | State |
|---|---|
| 0 — Technical research | ✅ `technical-research.md` (sources checked; hardware not yet tested) |
| 1 — Mobile foundation | ✅ Navigation, Home/Remote/Assistant/Keyboard/Devices/Settings screens, theme, persistence, Demo TV |
| 2 — Samsung | 🧪 Adapter and native module written; adapter unit-tested; **waiting on the first hardware session** |
| 3 — Voice & AI | 🟡 Push-to-talk and the local parser are done; the LLM interpreter is not started |
| 4 — YouTube | 🟡 Data API search with caching is done; playback on the TV depends on the Phase 2 hardware results |
| 5+ | Not started |

## Next: first demonstrable milestone (Task 6)

Needs a physical Samsung TV and an Android phone on the same Wi-Fi.

1. Build the development client with EAS (chosen 2026-11-08; no local Android SDK needed). From `apps/mobile`:
   - `npx eas-cli@latest login` (one time)
   - `npx eas-cli@latest init` (one time; links the project and writes `extra.eas.projectId` into `app.json`)
   - `npx eas-cli@latest build --profile development --platform android`

   **The Kotlin module has never been compiled, so expect the first build to fail in Gradle.** Copy the build log error back for fixing.
2. Install the APK from the EAS build page link (or QR code) on the Android phone.
3. On the dev machine, run `pnpm start` (phone and computer on the same Wi-Fi) and open the app on the phone.
4. Devices → Add a TV → Search this Wi-Fi (or enter the IP) → accept on the TV.
5. Work through the checklist in `technical-research.md §9` and record results in `device-integrations.md`.

**Exit criteria:** all of these work on the real TV (✅): discovery, pairing, reconnect after restart, navigation, volume, back/home, and typing into the YouTube and Netflix search boxes.

## After that

- **Phase 2b:** exact volume via UPnP RenderingControl; re-find a TV whose IP has changed; settle the YouTube deep-link question on hardware.
- **Phase 3:** a FastAPI `/interpret` endpoint in `apps/backend` sends the text to an LLM (behind a provider abstraction), and the phone validates the reply with `validateIntent`. Off by default, and the LLM key never lives on the phone.
- **Phase 4:** choose results by voice ("play the second one"), track playback status, and manage queues where the TV supports it.
- **Phase 5:** Android TV Remote v2: a Kotlin TLS module, mDNS discovery, and protobuf handling in TypeScript. A second, very different protocol is the real test of the adapter abstraction.
- **Phase 6:** Bluetooth HID keyboard/remote, IR, SmartThings OAuth.
- **Phase 7:** gateway and backend for remote access.

## Testing

- `pnpm test` (repo root): vitest for all packages (parser, device resolution, dispatcher, and the Samsung protocol against fixture message shapes).
- `pnpm --filter mobile typecheck`.
- Hardware tests are manual and logged in `device-integrations.md`. A device is never listed as working on the strength of mocks.
