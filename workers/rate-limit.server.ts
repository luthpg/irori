/**
 * NFR-SEC-03 / NFR-COST-01: スライディングウィンドウ方式のエッジ・レートリミッター
 * メッセージ投稿・メディアアップロード・Webhook・WebSocket接続試行の過剰バーストから
 * Cloudflare Workers / Durable Objects / R2 Free Tier 枠を保護する。
 */

interface RateBucket {
  timestamps: number[];
}

const buckets = new Map<string, RateBucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  options: {
    limit: number;
    windowMs: number;
    nowMs?: number;
  },
): RateLimitResult {
  const now = options.nowMs ?? Date.now();
  const windowStart = now - options.windowMs;

  const existing = buckets.get(key) ?? { timestamps: [] };
  const validTimestamps = existing.timestamps.filter((ts) => ts > windowStart);

  if (validTimestamps.length >= options.limit) {
    const oldestInWindow = validTimestamps[0] ?? now;
    const retryAfterMs = Math.max(
      1000,
      oldestInWindow + options.windowMs - now,
    );
    buckets.set(key, { timestamps: validTimestamps });
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  validTimestamps.push(now);
  buckets.set(key, { timestamps: validTimestamps });

  return {
    allowed: true,
    remaining: Math.max(0, options.limit - validTimestamps.length),
    retryAfterSeconds: 0,
  };
}

export function resetRateLimitsForTest() {
  buckets.clear();
}
