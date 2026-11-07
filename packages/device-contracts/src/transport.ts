/**
 * Connectivity-layer contracts. Protocol code (adapters) depends only on these
 * interfaces; the mobile app injects React Native / native-module
 * implementations, tests inject fakes, and a future home gateway can inject
 * Node implementations. This keeps protocols independent of the runtime.
 */

export interface MessageSocket {
  send(data: string): void;
  close(): void;
  onMessage(listener: (data: string) => void): () => void;
  onClose(listener: (info: { code?: number; reason?: string; error?: string }) => void): () => void;
}

export interface SocketOpenOptions {
  /**
   * Many TVs present self-signed TLS certificates. When set, the transport
   * must pin the certificate seen on first use (TOFU) under this key rather
   * than disable verification globally.
   */
  pinKey?: string;
  timeoutMs?: number;
}

export interface SocketFactory {
  open(url: string, options?: SocketOpenOptions): Promise<MessageSocket>;
}

export interface HttpResponse {
  status: number;
  text(): Promise<string>;
}

export interface HttpClient {
  request(
    url: string,
    init?: { method?: string; body?: string; headers?: Record<string, string>; timeoutMs?: number },
  ): Promise<HttpResponse>;
}

export interface SsdpResponse {
  /** Address the response came from. */
  address: string;
  /** Header names lower-cased. */
  headers: Record<string, string>;
}

export interface LanTransport {
  /** Multicast an SSDP M-SEARCH for `searchTarget` and collect responses. */
  ssdpSearch(searchTarget: string, timeoutMs: number): Promise<SsdpResponse[]>;
  /** Broadcast a Wake-on-LAN magic packet. */
  wakeOnLan(macAddress: string): Promise<void>;
}

export interface Transports {
  socket: SocketFactory;
  http: HttpClient;
  lan?: LanTransport;
}
