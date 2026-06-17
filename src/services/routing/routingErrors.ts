/**
 * Routing failures, classified so the UI can show the right message and decide
 * whether a retry is worthwhile. Messages are generic Japanese strings and
 * NEVER contain the API key or the request URL.
 */

export type RoutingErrorKind =
  | 'auth' // 401 / 403
  | 'rate-limit' // 429
  | 'server' // 5xx / other non-OK
  | 'network' // connection failure
  | 'timeout' // exceeded the time budget
  | 'aborted' // superseded / cancelled
  | 'invalid-response' // body unparseable / failed validation
  | 'no-route'; // valid response but no usable route

const DEFAULT_MESSAGES: Record<RoutingErrorKind, string> = {
  auth: 'ルート計算の認証に失敗しました。設定を確認してください。',
  'rate-limit': 'ルート計算の利用上限に達しました。しばらくしてからお試しください。',
  server: 'ルート計算サービスでエラーが発生しました。しばらくしてからお試しください。',
  network: '通信に失敗しました。接続を確認してください。',
  timeout: 'ルート計算がタイムアウトしました。もう一度お試しください。',
  aborted: 'ルート計算が中止されました。',
  'invalid-response': 'ルート結果を読み取れませんでした。',
  'no-route': 'ルートが見つかりませんでした。',
};

export class RoutingError extends Error {
  readonly kind: RoutingErrorKind;
  override readonly cause?: unknown;

  constructor(kind: RoutingErrorKind, message?: string, cause?: unknown) {
    super(message ?? DEFAULT_MESSAGES[kind]);
    this.name = 'RoutingError';
    this.kind = kind;
    this.cause = cause;
  }
}

export function routingMessage(kind: RoutingErrorKind): string {
  return DEFAULT_MESSAGES[kind];
}

export function statusToRoutingErrorKind(status: number): RoutingErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  return 'server';
}
