# Universal AI TV Controller

Turn an Android phone into a voice-first universal TV remote. Say "play Suzanna by Sauti Sol" or "open Netflix", or use the remote and the phone keyboard.

**Status:** Phases 0–1 are done. The Samsung integration is written and unit-tested but **has not been tested on a real TV yet**. See [docs/implementation-plan.md](docs/implementation-plan.md).

## Repository layout

```text
apps/
  mobile/                 Expo (SDK 58) + React Native app, Android first
    src/app/              screens (Expo Router)
    src/commands|voice|devices|connectivity|services|store|theme
    modules/tv-native/    local Kotlin module: pinned WebSocket, SSDP, Wake-on-LAN
  backend/  gateway/      placeholders (Phase 3 / Phase 7)
packages/
  device-contracts/       adapter + capability + transport interfaces
  command-schemas/        Zod intent schemas
  command-engine/         local parser, device selection, dispatcher
  samsung-protocol/       Samsung Tizen adapter
docs/                     research, architecture, connectivity, security, plan
```

## Getting started

Requirements: Node 22+, pnpm 10, and an Android phone. To build locally you also need the Android SDK (Android Studio); without it, use EAS.

```bash
pnpm install
pnpm test                       # unit tests for all packages
pnpm --filter mobile typecheck

# Development build (required: Expo Go can't load the native module)
cd apps/mobile
pnpm build:android              # EAS cloud build (no Android SDK needed)
# or, with the Android SDK installed: pnpm android:local
pnpm start                      # Metro for the dev client
```

No API keys are needed for remote control. YouTube search needs a YouTube Data API key, which you enter in **Settings**. See [.env.example](.env.example).

You can try the app without a TV: **Devices → Add a TV → Add Demo TV (simulated)**.

## What works where

| | Demo TV | Samsung (Tizen 2016+) |
|---|---|---|
| Remote keys, volume, apps | simulated | implemented, not yet hardware-tested |
| Phone keyboard → TV | simulated | implemented, not yet hardware-tested |
| Voice commands (local parser) | ✓ | ✓ (same engine) |
| YouTube search | ✓ with API key | ✓ with API key |
| Play a specific YouTube video | simulated | protocol unverified |
| Netflix: open + search by phone keyboard | simulated | implemented, not yet hardware-tested |

## Docs

[Technical research](docs/technical-research.md) · [Architecture](docs/architecture.md) · [Connectivity](docs/connectivity.md) · [Device integrations](docs/device-integrations.md) · [Security](docs/security.md) · [Plan](docs/implementation-plan.md) · [Agent guide](AGENTS.md)
