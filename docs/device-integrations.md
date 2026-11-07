# Device integrations — status

Legend: ✅ implemented and tested on hardware · 🧪 implemented and unit-tested, **unverified on hardware** · 🟡 simulated (Demo TV only) · ⛔ not supported · 🗓 planned

> Nothing below has been run against a physical TV yet. The unit tests show our logic matches the message shapes used by maintained libraries. They do **not** show that any particular TV model works. After each hardware session, update this table with the model and firmware.

## Samsung Tizen (`@tvc/samsung-protocol`)

| Feature | Status | Notes |
|---|---|---|
| SSDP discovery + `/api/v2/` probe | 🧪 | |
| Manual IP | 🧪 | |
| Pairing (on-TV Allow → token) | 🧪 | 2018+ `wss:8002` with TOFU pin; 2016–17 `ws:8001` |
| Reconnect with stored token | 🧪 | Token rotation re-persisted |
| Navigation, OK, back, home, menu | 🧪 | |
| Volume step, mute, channel | 🧪 | |
| Play / pause / stop / FF / rewind | 🧪 | No play/pause toggle key exists, so the app alternates play and pause |
| Source key | 🧪 | |
| Exact volume | ⛔ → 🗓 | UPnP RenderingControl planned |
| Specific HDMI input | ⛔ | No documented key; SmartThings later |
| Text input (phone keyboard) | 🧪 | Needs a focused TV text field (`imeStart`) |
| Launch YouTube / Netflix / others | 🧪 | Installed-app list, with fallback IDs |
| Netflix search via phone keyboard | 🧪 | Opens Netflix, then the phone keyboard opens pre-filled with the query |
| Open a specific YouTube video | 🧪 **unverified protocol** | Tries DIAL first, then metaTag; reported only as sent or acknowledged |
| Power off | 🧪 | Frame TVs: 3 s hold |
| Power on (Wake-on-LAN) | 🧪 | Requires "Power On with Mobile" |
| Power state readback | 🧪 | Newer models only |
| 2015 and older models | ⛔ | |

## Demo TV (`MockAdapter`)
All capabilities 🟡. The UI labels it "Simulated" everywhere.

## Planned
| Platform | Phase | Notes |
|---|---|---|
| Android TV / Google TV (Remote v2) | 5 | Needs Kotlin TLS-client-cert module |
| Roku (ECP, official) | 8 | "Control by mobile apps" must be enabled |
| LG webOS (SSAP) | 8 | Reuses TOFU socket |
| TCL / Hisense | 5/8 | Routed by OS: Google TV → Android TV adapter, Roku TV → Roku |
| SmartThings cloud | 6 | OAuth2 app registration required |
| Bluetooth HID (phone as keyboard/remote) | 6 | Android only |
| IR (phone emitter / Wi-Fi bridge) | 6 | One-way |

## Hardware log
| Date | Model | Year/firmware | Result |
|---|---|---|---|
| — | — | — | — |
