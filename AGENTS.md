# Agent guide

The product spec lives in the project brief. Read `docs/architecture.md` and `docs/implementation-plan.md` before you change anything.

## Ground rules

- **Do not invent protocol details.** Every TV message must trace to official docs or a maintained library's source. Label it in `docs/technical-research.md` (OFFICIAL / COMMUNITY-VERIFIED / COMMUNITY-REPORTED / UNVERIFIED) and add a comment in code next to anything unverified.
- **Do not claim hardware compatibility from mocks.** Update the hardware log in `docs/device-integrations.md` only with real test results.
- **Report honestly.** Adapters return `sent` unless the TV actually replied (`acknowledged`) or the result was read back (`confirmed`). Unsupported operations throw `TVError('unsupported')`; they never pretend to succeed.
- **Every TV action goes through `dispatch()`** in `@tvc/command-engine`. UI code never talks to adapters for commands. The keyboard screen's direct `sendText` is the one exception, because it is a raw input channel.
- **AI output is untrusted.** It must pass `validateIntent` before it reaches the dispatcher.
- **Keep protocol packages free of React Native.** They depend only on `@tvc/device-contracts` and the `Transports` interface.
- Secrets go only to SecureStore. Never put them in SQLite, logs or source code.
- Don't provision paid infrastructure without explicit approval.

## Commands (repo root)

```bash
pnpm install
pnpm test                         # vitest, all packages
pnpm --filter mobile typecheck
cd apps/mobile && npx expo-doctor
```

Run tests and the typecheck before you declare a task done.

## Expo specifics (from the Expo template)

- **Expo changes every SDK; don't trust memory.** Check the `expo` major version in `apps/mobile/package.json`, then read `https://docs.expo.dev/versions/v<major>.0.0/` or `https://docs.expo.dev/llms.txt`.
- Add native packages with `pnpm expo install <pkg>` (from `apps/mobile`) so versions match the SDK.
- Routes live in `apps/mobile/src/app/`; keep non-route code outside it.
- `android/` and `ios/` are generated (CNG). Never edit them by hand; use `app.json` or config plugins.
- Native code changes (`modules/tv-native`) need a rebuild (`pnpm android`); Fast Refresh won't pick them up.

## Package manager

Use pnpm. `pnpm-workspace.yaml` blocks packages published less than 24 h ago and blocks dependency install scripts. If a new dependency fails with a build-script error, review it before adding it to `onlyBuiltDependencies`.
