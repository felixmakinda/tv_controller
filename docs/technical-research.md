# Technical research (Phase 0)

Last verified: **2026-11-08**. Sources were read directly (library source code, official docs). Nothing in this document has yet been tested against physical hardware — see §8 for the hardware checklist.

**Source labels used throughout**

| Label | Meaning |
|---|---|
| **OFFICIAL** | Published by the vendor for third-party use (e.g. Roku ECP, SmartThings API, Android SDK). |
| **COMMUNITY-VERIFIED** | Not published by the vendor, but implemented in a maintained, widely used library whose source we read (samsungtvws, Home Assistant, androidtvremote2, aiowebostv). |
| **COMMUNITY-REPORTED** | Forum posts / issues only; no maintained library relies on it. |
| **UNVERIFIED** | Our assumption; must be proven on hardware before we depend on it. |

---

## 1. Summary of conclusions

1. **Samsung (Tizen, 2016+) is controllable over the LAN** via a WebSocket protocol that Samsung does not document publicly but that is stable and widely implemented (COMMUNITY-VERIFIED). Pairing is a one-time on-TV "Allow" prompt that returns a token.
2. **Android TV / Google TV** is controllable via the *Android TV Remote Service v2* protocol (TLS + client certificate + protobuf; PIN pairing). COMMUNITY-VERIFIED (androidtvremote2, used by Home Assistant). Needs a native TLS/client-cert module.
3. **YouTube: search and playback are separate problems.** The YouTube Data API (OFFICIAL) can search but cannot control a TV. Starting playback on a TV must go through the TV adapter: Android TV app-link (COMMUNITY-VERIFIED) is the most reliable; Samsung video deep-linking is UNVERIFIED. There is no official way for a third-party app to cast to the YouTube receiver.
4. **YouTube search quota is tight:** `search.list` has its own bucket of **100 calls/day** by default — results must be cached, and a heavy household may need a quota increase.
5. **Netflix has no public catalogue/search API.** We can launch Netflix and send phone-keyboard text into its search box; we cannot resolve "play Stranger Things" to a title ID without an unofficial source.
6. **Bluetooth is not a general TV-control channel.** The useful, real path is the phone acting as a **Bluetooth HID keyboard/remote** (`BluetoothHidDevice`, OFFICIAL Android API 28+), which most smart TVs accept — with significant caveats (§5.3).
7. **Infrared**: some Android phones have a built-in IR emitter (`ConsumerIrManager`, OFFICIAL) — a no-hardware path for old TVs on those phones. Otherwise ESP32/commercial Wi-Fi IR bridges.
8. **Expo is viable** with a development build (not Expo Go). One local Kotlin module is required now (`tv-native`) and two more later (Android TV TLS, Bluetooth HID).

---

## 2. Samsung Smart TV (Tizen, 2016+)

Primary sources: `github.com/xchwarze/samsung-tv-ws-api` (samsungtvws: `connection.py`, `remote.py`, `event.py`, `rest.py`, `COMMANDS.md`, `APPLICATIONS.md`, test fixtures); Home Assistant `homeassistant/components/samsungtv` (`bridge.py`, `media_player.py`, `manifest.json`, fixtures).

### 2.1 Model generations

| Years | Platform | Protocol | Status in this app |
|---|---|---|---|
| ≤2013 (C–F series) | Orsay | Legacy TCP on port 55000 | Not supported (out of scope) |
| 2014–2015 (H/J series) | Orsay/early Tizen | Encrypted pairing (PIN) on 8000/8080 | Not supported — protocol is fragile |
| **2016–2017** | Tizen | `ws://:8001` WebSocket, no token | Supported (`TokenAuthSupport` = false) |
| **2018+** | Tizen | `wss://:8002` WebSocket + token | Supported (primary target) |

### 2.2 Discovery — COMMUNITY-VERIFIED

- SSDP `ST: urn:samsung.com:device:RemoteControlReceiver:1` (also used by HA; HA additionally matches `MainTVAgent2:1` and `RenderingControl:1` with manufacturer Samsung).
- Confirm by `GET http://HOST:8001/api/v2/` → JSON `device.{name, modelName, wifiMac, TokenAuthSupport ("true" string), duid, OS:"Tizen", FrameTVSupport, networkType}`. `PowerState` is present only on newer models.
- Manual IP entry is the fallback (implemented).

### 2.3 Pairing / authentication — COMMUNITY-VERIFIED

1. Open `wss://HOST:8002/api/v2/channels/samsung.remote.control?name=<base64(name)>` (token appended as `&token=` on 8002 only).
2. The TV shows "Allow this device?". On accept it sends `{"event":"ms.channel.connect","data":{"token": <number|string>}}`.
3. Denied → `ms.channel.unauthorized`; no answer → `ms.channel.timeOut`. Other startup events (`ms.channel.ready`, `clientConnect`, …) must be skipped.
4. The TV uses a **self-signed certificate**. samsungtvws disables verification entirely; **we pin the certificate on first use (TOFU)** instead (see `docs/security.md`).
5. Tokens may change on reconnect — the app re-persists the latest token.

### 2.4 Commands

| Function | Message | Source |
|---|---|---|
| Key press | `{"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":"KEY_…","Option":"false","TypeOfRemote":"SendRemoteKey"}}` (`Cmd` may be `Press`/`Release` to hold) | COMMUNITY-VERIFIED |
| Keys | `KEY_UP/DOWN/LEFT/RIGHT/ENTER/RETURN/HOME/MENU/VOLUP/VOLDOWN/MUTE/CHUP/CHDOWN/PLAY/PAUSE/STOP/FF/REWIND/SOURCE/POWER`, `KEY_0–9` | COMMUNITY-VERIFIED |
| Play/pause toggle | **None exists.** HA tracks state and alternates `KEY_PLAY`/`KEY_PAUSE`; we do the same. | COMMUNITY-VERIFIED |
| HDMI 1–4 directly | Only `KEY_HDMI` is listed; `KEY_HDMI1..4` appear in no maintained source. → `input.select` = unsupported. SmartThings `mediaInputSource` is the realistic route. | UNVERIFIED |
| Text input | `{"method":"ms.remote.control","params":{"Cmd":"<base64 utf-8>","DataOfCmd":"base64","TypeOfRemote":"SendInputString"}}` then `{"…","params":{"TypeOfRemote":"SendInputEnd"}}`. samsungtvws first emits `custom.remote.textReceived` once per IME session. | COMMUNITY-VERIFIED |
| IME events | `ms.remote.imeStart` / `ms.remote.imeEnd` (tell us a text field is open) | COMMUNITY-VERIFIED |
| Launch app | `ms.channel.emit` `ed.apps.launch` `{appId, action_type: DEEP_LINK\|NATIVE_LAUNCH, metaTag}`; ack `{"event":"ed.apps.launch","data":200}` | COMMUNITY-VERIFIED |
| List apps | `ed.installedApp.get` → `data.data[{appId,name,app_type}]`; `app_type 2` → DEEP_LINK. **Some 2020+ models ignore it** — we fall back to known IDs. | COMMUNITY-VERIFIED |
| REST apps | `GET/POST/DELETE http://HOST:8001/api/v2/applications/<appId>`; response fields `running`/`visible` | Methods verified; fields UNVERIFIED |
| YouTube app id | `111299001912` | COMMUNITY-VERIFIED |
| Open a specific YouTube video | DIAL `POST http://HOST:8080/ws/apps/YouTube` body `v=ID` — or `ed.apps.launch` with `metaTag` | **UNVERIFIED** (neither library does it). Implemented as best-effort, reported as `sent`/`acknowledged` only. |
| Power off | `KEY_POWER` click. **Frame TVs:** a click toggles Art Mode — hold `KEY_POWER` ~3 s (HA does this). | COMMUNITY-VERIFIED |
| Power on | Wake-on-LAN magic packet to `wifiMac`, UDP 9. Requires TV setting "Power On with Mobile"/network standby. | COMMUNITY-VERIFIED |
| Absolute volume | UPnP `RenderingControl:1` `SetVolume`, location from SSDP `LOCATION` (port varies, e.g. 7676). Not implemented yet. | COMMUNITY-VERIFIED |

### 2.5 SmartThings (Samsung cloud) — OFFICIAL

- REST API `api.smartthings.com`, capabilities on TVs: `switch`, `audioVolume` (setVolume 0–100), `audioMute`, `mediaPlayback`, `mediaInputSource`, `samsungvd.mediaInputSource`, `tvChannel`, `samsungvd.remoteControl`.
- **Personal Access Tokens created after 30 Dec 2024 expire after 24 h.** A shipping app needs a registered SmartApp/OAuth2 client (HA moved to OAuth2).
- Use cases: remote (off-LAN) control, exact HDMI selection, power-on where WoL fails. Requires the TV to be registered in the user's SmartThings account and internet on both ends.

---

## 3. Android TV / Google TV

Primary sources: `github.com/tronikos/androidtvremote2` (`pairing.py`, `base.py`, `remote.py`, `remotemessage.proto`), Home Assistant `androidtv_remote`.

| Topic | Finding | Source |
|---|---|---|
| Service | "Android TV Remote Service" (`com.google.android.tv.remote.service`) — present on Google TV and most Android TV 9+ devices (Chromecast with Google TV, TCL/Hisense Google TV, Sony, Philips…). Not guaranteed on every OEM build. | COMMUNITY-VERIFIED |
| Discovery | mDNS `_androidtvremote2._tcp.local.` | COMMUNITY-VERIFIED |
| Pairing | TLS to **6467** with a self-generated client certificate. TV shows a 6-hex-char PIN. Secret = SHA-256(client modulus ‖ client exponent ‖ server modulus ‖ server exponent ‖ bytes.fromhex(pin[2:])); check `digest[0] == pin[0:2]`. | COMMUNITY-VERIFIED |
| Control | TLS to **6466** with the same client cert; varint-length-prefixed protobuf | COMMUNITY-VERIFIED |
| Keys | `RemoteKeyInject{key_code, direction}` (Android KeyEvent codes, incl. `KEYCODE_POWER`, `MEDIA_PLAY_PAUSE`) | COMMUNITY-VERIFIED |
| Apps / deep links | `RemoteAppLinkLaunchRequest{app_link}` — e.g. `https://www.youtube.com/watch?v=ID`, `https://www.netflix.com/title/ID` | COMMUNITY-VERIFIED (YouTube); Netflix UNVERIFIED |
| Text | `RemoteImeBatchEdit{ime_counter, field_counter, edit_info}` using counters the TV reports | COMMUNITY-VERIFIED |
| Volume | TV *reports* `RemoteSetVolumeLevel{max, level, muted}`; **no absolute set** — steps only | COMMUNITY-VERIFIED |
| Power on | Works from standby on most devices (the service stays alive); not from full power-off | COMMUNITY-REPORTED |

**Implementation implication:** React Native cannot do TLS with a client certificate + raw sockets. A Kotlin module must generate an RSA key pair in Android Keystore, build a self-signed cert, open `SSLSocket`s, and expose the cert's modulus/exponent to the TS pairing code. Protobuf framing can stay in TypeScript.

## 4. Other manufacturers

| Brand | Protocol | Source | Notes |
|---|---|---|---|
| **Roku** | ECP: HTTP port 8060, `POST /keypress/<Key>`, `POST /launch/<channelId>?contentId=…`, text via `Lit_<urlencoded char>`; SSDP `roku:ecp` | **OFFICIAL** | Since Roku OS 14.1, **"Control by mobile apps"** must be enabled on the TV. YouTube channel id `837` UNVERIFIED. Easiest adapter to build. |
| **LG webOS** | SSAP WebSocket `wss://:3001` (fallback `ws://:3000`), register handshake → `PROMPT` → `registered` + `client-key` | COMMUNITY-VERIFIED (aiowebostv) | Self-signed cert → reuse TOFU socket. Buttons go over a secondary "pointer" socket. |
| **TCL / Hisense** | Per model OS: **Google TV/Android TV → Android TV adapter**; **Roku TV → Roku adapter**; Hisense **VIDAA** → MQTT-based, community only; TCL non-Google Linux → unknown | mixed | Brand ≠ protocol; detect by discovery service, not by brand. |

---

## 5. Connectivity boundaries

### 5.1 Comparison matrix

| | Local Wi-Fi/LAN | Manufacturer cloud (SmartThings) | Home gateway (ours) | Bluetooth HID (phone as keyboard/remote) | IR (phone emitter / Wi-Fi IR bridge) |
|---|---|---|---|---|---|
| Works off home network | No | **Yes** | **Yes** | No (≈10 m) | No |
| Needs internet | No | Yes | Yes | No | No |
| Latency | ~10–50 ms | ~300–1500 ms | ~100–300 ms | ~10 ms | ~10 ms |
| Pairing | On-TV prompt / PIN | OAuth account link | Gateway enrolment + LAN pairing | TV Bluetooth settings | None |
| Navigation & keys | Yes | Partial (`samsungvd.remoteControl`) | Yes (proxied LAN) | **Yes** (HID usages) | Yes |
| Text input | Yes (protocol IME) | No | Yes | **Yes** (real keyboard) | No |
| App launch / deep link | Yes | Limited | Yes | No (Home/search keys only) | No |
| Exact volume / input | Model-dependent | **Yes** | Model-dependent | No | Codes only |
| State readback | Partial | **Yes** | Partial | No | **None** — blind |
| Power on | WoL (setting needed) | **Yes** | WoL from gateway | Some TVs wake on BT | Yes |
| Extra hardware | None | None | Pi/mini-PC/old phone | None | Phone with IR, or bridge |
| Cost / ops | Free | Free, needs OAuth app registration | Server + device to maintain | Free | Bridge ~$10–30 |
| Phase | **MVP** | 6 | 7 | 6 | 6 |

### 5.2 Internet-based control
- **Cloud API (SmartThings):** the only supported Samsung path when away from home. Needs registered OAuth client (24 h PATs make PATs unusable for users).
- **Gateway:** outbound authenticated WebSocket from a home device to our backend; TV ports never exposed. The protocol packages (`packages/*-protocol`) are runtime-agnostic precisely so the gateway can reuse them in Node.

### 5.3 Bluetooth — realistic scope
- **TVs do not expose a general-purpose Bluetooth control API.** Seeing a TV in a BLE scan does not mean it is controllable.
- **Phone-as-HID** via `BluetoothHidDevice` (OFFICIAL, API 28+, needs `BLUETOOTH_CONNECT` on 31+): register a keyboard + consumer-control descriptor; user pairs from the TV's Bluetooth settings. Gives keys, volume, media keys and real keyboard text on Samsung, LG, Android TV.
  - Caveats (OFFICIAL docs): only one app may be registered at a time; the app is **unregistered when not in the foreground**; it disables the phone's HID-host role while registered. Some OEM phones ship without the profile (COMMUNITY-REPORTED). **Not available on iOS.**
- Samsung's own BLE remote (Smart Remote) protocol is proprietary — not pursued.

### 5.4 Infrared
- `ConsumerIrManager` (OFFICIAL, API 19): `hasIrEmitter()`, `transmit(freqHz, pattern)`; patterns < 2 s; `TRANSMIT_IR` permission. Present on some Xiaomi/Redmi/POCO, Huawei, older Samsung/LG/HTC phones. Needs an IR code database (e.g. open IRDB-style sets, verify licence before bundling).
- Wi-Fi IR bridge: ESP32 + IR LED (ESPHome / Tasmota), or Broadlink-style commercial blasters. IR is **one-way**: never report more than `sent`.

---

## 6. YouTube

| Need | Mechanism | Status |
|---|---|---|
| Search | YouTube Data API v3 `search.list` | OFFICIAL. **Quota: dedicated bucket of 100 calls/day by default**; `videos.list` costs 1 unit from the 10 000/day general bucket. Cache aggressively; request a quota increase before wide release. API key must be restricted to the app's package + SHA-1. |
| Play on Android/Google TV | App link `https://www.youtube.com/watch?v=ID` via Remote v2 | COMMUNITY-VERIFIED (HA docs). Most reliable path. |
| Play on Samsung | DIAL `POST :8080/ws/apps/YouTube` `v=ID`, or `ed.apps.launch` metaTag | **UNVERIFIED** — top hardware-test item. Fallback: launch YouTube + phone keyboard search. |
| Play on Roku | ECP `launch/837?contentId=ID` | OFFICIAL mechanism; channel id UNVERIFIED |
| Cast SDK | Only Default Media Receiver or your own registered receivers. **No documented way for a third-party sender to drive the YouTube receiver.** | OFFICIAL (by omission) |
| YouTube "Link with TV code" / Lounge API | Undocumented, changes without notice | Rejected — violates "prefer official" and is brittle |

Never scrape YouTube pages; never automate Google sign-in.

## 7. Netflix

- **No public API** (Netflix closed its public API in 2014). Title search/ID resolution has no official source.
- **What we can do:** launch Netflix (Samsung: installed-app list or fallback id; Android TV: app link), then deliver the user's query via the phone keyboard into Netflix's search field. Implemented as the "open app + hand query to keyboard" flow.
- **UNVERIFIED on hardware:** whether Netflix on Tizen raises `ms.remote.imeStart` for its search box (Netflix often draws its own on-screen keyboard). If it doesn't, the fallback is HID keyboard (Bluetooth) or D-pad.
- Android TV: `https://www.netflix.com/title/<id>` app links are widely reported to open titles (COMMUNITY-REPORTED) — useful once an ID is known (e.g. from the user's history in a later phase).

---

## 8. Architecture validation (Task 4)

**Verdict:** React Native + Expo (development build, CNG) + TypeScript + Kotlin modules is sound. All protocol logic is pure TypeScript and unit-tested off-device; Kotlin is limited to byte-moving primitives.

| Native capability | Needed for | Module | Status |
|---|---|---|---|
| WebSocket with TOFU-pinned self-signed cert | Samsung 8002, LG 3001 | `apps/mobile/modules/tv-native` | **Written, not yet compiled on a device** |
| SSDP M-SEARCH with `MulticastLock` | Samsung, Roku, LG, UPnP discovery | `tv-native` | Written, not compiled |
| Wake-on-LAN | Samsung/LG power-on | `tv-native` | Written, not compiled |
| mDNS (NsdManager) | Android TV discovery | extend `tv-native` | Phase 5 |
| TLS socket with Keystore client cert | Android TV Remote v2 | new Kotlin module | Phase 5 |
| `BluetoothHidDevice` | Phone as BT keyboard/remote | new Kotlin module | Phase 6 |
| `ConsumerIrManager` | Built-in IR | new Kotlin module (tiny) | Phase 6 |
| Speech recognition | Voice | `expo-speech-recognition` (Android SpeechRecognizer, on-device option) | Integrated |
| Secure storage | Tokens, API keys | `expo-secure-store` | Integrated |
| Local DB | Devices, settings, search cache | `expo-sqlite` (kv-store) | Integrated |

**Android platform constraints**
- Cleartext HTTP is blocked by default since Android 9; Samsung info/REST and Roku ECP are plain HTTP on LAN → `usesCleartextTraffic=true` (Network Security Config cannot whitelist IP ranges). Documented in `security.md`.
- SSDP needs `CHANGE_WIFI_MULTICAST_STATE` + a held `MulticastLock`.
- **UNVERIFIED / watch item:** newer Android releases are introducing a runtime *local network access* permission for apps targeting the latest SDK. Check the target-SDK requirements at each Expo SDK upgrade and add the permission + rationale UI if required.
- Microphone: runtime `RECORD_AUDIO`; rationale string configured.

**Expo constraints**
- Expo Go cannot load `tv-native`; the app detects this (`requireOptionalNativeModule`) and offers the Demo TV only.
- `android/` is generated (CNG) — never hand-edit; configure via `app.json`/config plugins.

## 9. Hardware test checklist (first Samsung session)

Record model, year, firmware for each item. ✅/❌ results go into `docs/device-integrations.md`.

1. SSDP discovery finds the TV; manual IP probe works.
2. Pairing prompt appears; token returned; TOFU pin stored; reconnect after app restart without prompt.
3. Keys: arrows, OK, back, home, volume, mute, channel, play, pause.
4. Text: open YouTube search → `imeStart` fires → phone text appears → submit works. Repeat inside **Netflix** search.
5. `ed.installedApp.get` answered? Launch YouTube & Netflix; ack received?
6. **YouTube video deep link**: DIAL vs `metaTag` — which (if either) plays the video?
7. Power off (and Frame behaviour if applicable); WoL power on with "Power On with Mobile" enabled.
8. Kill Wi-Fi / restart TV → app shows offline → reconnects automatically.
