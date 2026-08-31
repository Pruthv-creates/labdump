import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * DB-backed rate limiting.
 *
 * The previous per-route `Map` limiters were ineffective in production: each
 * serverless instance kept its own Map, so the counter reset on every cold
 * start and scaled with instance count. They also read `x-forwarded-for`
 * directly, which a client can set to any value to reset its own bucket.
 *
 * This limiter shares state in Postgres and derives the client key from the
 * platform-verified edge header where available.
 */

/**
 * Only the LAST entry of x-forwarded-for is appended by our own edge; earlier
 * entries are client-controlled and must not be trusted.
 */
function getClientKey(request: Request): string {
  const platformIp =
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-vercel-forwarded-for');

  if (platformIp) return platformIp.trim();

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return 'unknown';
}

/**
 * Increment the counter for (bucket, client) and report whether it is over the
 * limit. Fails OPEN on infrastructure errors so a DB hiccup cannot lock out
 * the whole app.
 */
export async function checkRateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfter: number }> {
  const key = createHash('sha256')
    .update(`${bucket}:${getClientKey(request)}`)
    .digest('hex');

  try {
    const { data, error } = await supabaseAdmin.rpc('consume_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) return { allowed: true, retryAfter: 0 };

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { allowed: true, retryAfter: 0 };

    return {
      allowed: Boolean(row.allowed),
      retryAfter: Number(row.retry_after) || windowSeconds,
    };
  } catch {
    return { allowed: true, retryAfter: 0 };
  }
}

/**
 * Convenience wrapper: returns a 429 response when the caller is over the
 * limit, or null when the request may proceed.
 */
export async function enforceRateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<NextResponse | null> {
  const { allowed, retryAfter } = await checkRateLimit(request, bucket, limit, windowSeconds);

  if (allowed) return null;

  return NextResponse.json(
    { data: null, error: 'RATE_LIMIT_EXCEEDED' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}
