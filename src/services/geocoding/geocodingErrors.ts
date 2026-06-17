/**
 * Geocoding failures, classified so the UI can show the right message and
 * decide whether a retry is worthwhile. Error messages are deliberately
 * generic and NEVER contain the API key or the request URL.
 */

export type GeocodingErrorKind =
  | 'auth' // 401 / 403 — bad or unauthorised key
  | 'rate-limit' // 429 — quota / rate limit exceeded
  | 'server' // 5xx or other non-OK status
  | 'network' // connection failure
  | 'timeout' // request exceeded the time budget
  | 'aborted' // superseded / cancelled by the caller
  | 'invalid-response'; // body could not be parsed / failed validation

/** Default, user-facing Japanese messages per error kind (no secrets). */
const DEFAULT_MESSAGES: Record<GeocodingErrorKind, string> = {
  auth: '検索サービスの認証に失敗しました。設定を確認してください。',
  'rate-limit': '検索の利用上限に達しました。しばらくしてからお試しください。',
  server: '検索サービスでエラーが発生しました。しばらくしてからお試しください。',
  network: '通信に失敗しました。接続を確認してください。',
  timeout: '検索がタイムアウトしました。もう一度お試しください。',
  aborted: '検索が中止されました。',
  'invalid-response': '検索結果を読み取れませんでした。',
};

export class GeocodingError extends Error {
  readonly kind: GeocodingErrorKind;
  override readonly cause?: unknown;

  constructor(kind: GeocodingErrorKind, message?: string, cause?: unknown) {
    super(message ?? DEFAULT_MESSAGES[kind]);
    this.name = 'GeocodingError';
    this.kind = kind;
    this.cause = cause;
  }
}

/** Human-facing message for a known error kind. */
export function geocodingMessage(kind: GeocodingErrorKind): string {
  return DEFAULT_MESSAGES[kind];
}

/** Map an HTTP status to an error kind (used on a non-OK response). */
export function statusToErrorKind(status: number): GeocodingErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  return 'server';
}
