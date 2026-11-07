export type TVErrorCode =
  | 'unreachable' // host did not answer
  | 'pairing_rejected' // user denied on the TV
  | 'pairing_timeout' // user never answered the TV prompt
  | 'unauthorized' // stored credentials no longer accepted
  | 'not_connected'
  | 'unsupported' // device/protocol cannot do this
  | 'timeout'
  | 'protocol' // unexpected response
  | 'cancelled';

export class TVError extends Error {
  readonly code: TVErrorCode;
  override readonly cause?: unknown;

  constructor(code: TVErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'TVError';
    this.code = code;
    this.cause = cause;
  }
}

export function isTVError(e: unknown): e is TVError {
  return e instanceof TVError;
}
