import { NativeModule, requireOptionalNativeModule } from 'expo';

export type SocketMessageEvent = { socketId: string; data: string };
export type SocketCloseEvent = { socketId: string; code?: number; reason?: string; error?: string };
export type SsdpResult = { address: string; headers: Record<string, string> };

type Events = {
  onSocketMessage(e: SocketMessageEvent): void;
  onSocketClose(e: SocketCloseEvent): void;
};

declare class TvNativeModule extends NativeModule<Events> {
  openSocket(url: string, pinKey: string | null, timeoutMs: number): Promise<string>;
  sendSocket(socketId: string, data: string): boolean;
  closeSocket(socketId: string): void;
  forgetPin(pinKey: string): void;
  ssdpSearch(searchTarget: string, timeoutMs: number): Promise<SsdpResult[]>;
  wakeOnLan(mac: string): Promise<void>;
}

/**
 * Null in Expo Go, on web, or before a development build has been rebuilt.
 * Callers must handle that and fall back to mock devices.
 */
export default requireOptionalNativeModule<TvNativeModule>('TvNative');
