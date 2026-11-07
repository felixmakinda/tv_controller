# Security & privacy

## Implemented

| Requirement | How |
|---|---|
| Never expose TV ports to the internet | The MVP is LAN-only. The planned gateway will open outbound connections only. |
| Protect pairing credentials | Tokens are stored only in `expo-secure-store` (Android Keystore). They never go to SQLite or logs. |
| No hard-coded keys | The YouTube key is entered in Settings and kept in SecureStore. `EXPO_PUBLIC_*` is an optional development fallback; it ships inside the app bundle, so restrict that key in Google Cloud Console. |
| Self-signed TV certificates | **Trust-on-first-use pinning.** The SHA-256 of the TV's certificate is stored on first connection, and any later mismatch fails the connection. TLS verification is never disabled globally. Removing a device deletes its pin. |
| AI output can't act directly | Every intent must pass `CommandIntentSchema` (Zod) and runs only through `dispatch()`. No code path leads from AI output to network or OS calls. |
| Confirmation for disruptive actions | Turning a TV off and commands that hit several TVs ask for confirmation first (configurable in Settings). |
| Voice privacy | Push-to-talk only. The app records and stores no audio. On-device recognition is the default where the phone supports it. |
| Delete pairing info | Devices → Remove deletes the token and the certificate pin. |
| Password fields | The keyboard screen has a "hide text" toggle that also turns off autocorrect. Typed text is never logged or saved. |
| Minimal permissions | Storage and overlay permissions that Expo adds by default are blocked in `app.json`. |
| Supply chain | pnpm with `minimumReleaseAge: 1440`, dependency install scripts blocked, and `strictDepBuilds`. |

## Public repository rules

The repo is public (github.com/felixmakinda/tv_controller). The root `.gitignore` is split into **secrets** and **generated files**.

- **Never committed:** `.env*` (except `.env.example`), signing keys (`*.jks`, `*.keystore`, `*.p8`, `*.p12`), private keys/certs (`*.pem`, `*.key`), EAS `credentials.json`, Google service files, backend `.env`.
- **Safe to commit:** `app.json`'s EAS `projectId`/`owner` (identifiers, not credentials), `eas.json`, the lockfile.
- **Release signing keys** stay in EAS's remote credential store, never in the repo.
- **The `.gitignore` alone isn't enough.** Any `EXPO_PUBLIC_*` value is compiled into the app and can be pulled out of the APK by anyone. Never put a secret there. User-entered keys go to SecureStore, and server-side keys (LLM) will live only in `apps/backend`.
- Before each push: `git diff --cached` and look for keys. Turn on GitHub **secret scanning + push protection** (repo Settings → Code security).

## Accepted risks

1. **Cleartext HTTP is enabled app-wide** (`usesCleartextTraffic`). Samsung's info/REST endpoints and Roku ECP are plain HTTP on the LAN, and Android's Network Security Config cannot allow-list IP ranges. Mitigation: no secret is ever sent over plain HTTP; the Samsung token travels only over the pinned `wss` connection.
2. **The first connection is not authenticated (a limit of TOFU).** An attacker already on the home network during the first pairing could pretend to be the TV. We accept this for a home LAN, and the user must also approve the connection on the TV itself.
3. **Wake-on-LAN** is unauthenticated by design. Anyone on the LAN could send the same packet.
4. **Hostname checks are skipped for pinned sockets.** TV certificates aren't issued for the TV's LAN IP. The pin takes the place of the hostname check, and this applies only to sockets opened with a `pinKey`.

## Future (gateway / cloud)

- Mutual authentication between gateway and backend (device-bound keys).
- TLS on every connection.
- Per-household authorization on every relayed command.
- Audit logging that by default never stores voice transcripts.
