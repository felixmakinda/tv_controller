import type {
  HttpClient,
  LanTransport,
  MessageSocket,
  SocketFactory,
  Transports,
} from '@tvc/device-contracts';
import TvNative from '@modules/tv-native';

/** True when the native LAN module is present (development build on Android). */
export const nativeLanAvailable = TvNative !== null;

type CloseInfo = { code?: number; reason?: string; error?: string };

class NativeSocket implements MessageSocket {
  private msgListeners = new Set<(d: string) => void>();
  private closeListeners = new Set<(i: CloseInfo) => void>();
  private subs: { remove(): void }[] = [];

  constructor(private readonly id: string) {
    const native = TvNative!;
    this.subs.push(
      native.addListener('onSocketMessage', (e) => {
        if (e.socketId === id) this.msgListeners.forEach((l) => l(e.data));
      }),
      native.addListener('onSocketClose', (e) => {
        if (e.socketId !== id) return;
        this.closeListeners.forEach((l) => l(e));
        this.dispose();
      }),
    );
  }

  send(data: string) {
    if (!TvNative!.sendSocket(this.id, data)) throw new Error('Socket is closed');
  }
  close() {
    TvNative!.closeSocket(this.id);
  }
  onMessage(l: (d: string) => void) {
    this.msgListeners.add(l);
    return () => this.msgListeners.delete(l);
  }
  onClose(l: (i: CloseInfo) => void) {
    this.closeListeners.add(l);
    return () => this.closeListeners.delete(l);
  }
  private dispose() {
    this.subs.forEach((s) => s.remove());
    this.subs = [];
  }
}

/**
 * Plain ws:// can use React Native's WebSocket; wss:// to a TV needs the
 * native module because TVs use self-signed certificates (pinned on first use).
 */
const socketFactory: SocketFactory = {
  async open(url, options) {
    if (!TvNative) throw new Error('LAN control needs the development build (native module missing).');
    const id = await TvNative.openSocket(url, options?.pinKey ?? null, options?.timeoutMs ?? 8000);
    return new NativeSocket(id);
  },
};

const http: HttpClient = {
  async request(url, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 5000);
    try {
      const res = await fetch(url, {
        method: init.method ?? 'GET',
        ...(init.body !== undefined ? { body: init.body } : {}),
        ...(init.headers ? { headers: init.headers } : {}),
        signal: controller.signal,
      });
      return { status: res.status, text: () => res.text() };
    } finally {
      clearTimeout(timer);
    }
  },
};

const lan: LanTransport | undefined = TvNative
  ? {
      ssdpSearch: (st, timeoutMs) => TvNative!.ssdpSearch(st, timeoutMs),
      wakeOnLan: (mac) => TvNative!.wakeOnLan(mac),
    }
  : undefined;

export const transports: Transports = { socket: socketFactory, http, ...(lan ? { lan } : {}) };

export function forgetCertificatePin(pinKey: string) {
  TvNative?.forgetPin(pinKey);
}
