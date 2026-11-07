# Connectivity

The full comparison matrix and its sources are in [technical-research.md §5](technical-research.md#5-connectivity-boundaries). This page covers how connectivity is structured in code.

## Layers

```text
Adapter (protocol)  ──uses──▶  Transports interface (@tvc/device-contracts)
                                 ├─ socket: SocketFactory   → tv-native WebSocket (TOFU pin for wss)
                                 ├─ http:   HttpClient      → fetch with timeout
                                 └─ lan?:   LanTransport    → tv-native SSDP (MulticastLock) + Wake-on-LAN
```

`lan` is optional. When the native module is missing (Expo Go, web, or before a rebuild), discovery finds nothing and the UI offers only the Demo TV.

## Connection lifecycle (`apps/mobile/src/devices/connection.ts`)

- On launch, once the saved devices have loaded, every saved device is connected.
- When a socket closes, the device shows `reconnecting` and retries with backoff: 1 s, 2 s, 5 s, 10 s, then every 30 s.
- Retries pause while the app is in the background. When it returns to the foreground, the backoff resets and every device reconnects.
- If the TV rejects the stored token (`unauthorized`), retries stop and the UI offers **Pair again**.
- Network changes show up as socket closes and follow the same path.

**Known gap:** if DHCP gives the TV a new IP, the saved host goes stale. Planned fix: after repeated failures, re-run SSDP, match the TV by `uniqueId`, and update `host`.

## Transport roadmap

| Transport | Phase |
|---|---|
| LAN WebSocket/HTTP/SSDP/WoL | MVP (built) |
| mDNS + TLS client-cert sockets (Android TV) | 5 |
| Bluetooth HID device | 6 |
| IR (ConsumerIrManager / ESPHome bridge) | 6 |
| SmartThings REST | 6 |
| Gateway relay (secure WebSocket) | 7 |
