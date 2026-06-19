export type WeatherErrorKind =
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'server'
  | 'invalid-response'
  | 'out-of-range';

export class WeatherError extends Error {
  readonly kind: WeatherErrorKind;

  constructor(kind: WeatherErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'WeatherError';
    this.kind = kind;
    if (cause !== undefined) this.cause = cause;
  }
}
