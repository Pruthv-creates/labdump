import { cookies } from 'next/headers';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';
import { SupabaseWorkspace } from '@/types/database';

/**
 * Owner sessions for LabDump.
 *
 * Lab PCs are shared by many students, so ownership must NEVER outlive the
 * browser session. Two rules make that true:
 *
 *   1. The cookie is a session cookie (no maxAge) — it dies when the browser
 *      closes, so the next student starts clean.
 *   2. The cookie value is a random secret, NOT the workspace UUID. The UUID
 *      doubles as the recovery key, so putting it in a readable place meant
 *      anyone who saw the cookie owned the workspace forever.
 *
 * The secret is stored hashed; a leaked DB row cannot be replayed as a cookie.
 */

export const OWNER_COOKIE = 'owner_session';

/** Sessions are short-lived even within a browser session. */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Constant-time compare so a token cannot be recovered by timing the response.
 */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Issue a new owner session for a workspace and return the raw token.
 * Only the hash is persisted.
 */
export async function createOwnerSession(workspaceId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const { error } = await supabaseAdmin.from('owner_sessions').insert({
    token_hash: hashToken(token),
    workspace_id: workspaceId,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  return token;
}

/**
 * Resolve the current request's owner session to a workspace.
 * Returns null for missing, unknown, or expired sessions.
 */
export async function getSessionWorkspace(): Promise<SupabaseWorkspace | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(OWNER_COOKIE)?.value;
  if (!token) return null;

  const { data, error } = await supabaseAdmin
    .from('owner_sessions')
    .select('workspace_id, expires_at, workspaces(*)')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  if (error || !data) return null;

  if (new Date(data.expires_at).getTime() < Date.now()) {
    await destroyOwnerSession(token);
    return null;
  }

  const workspace = (data as unknown as { workspaces: SupabaseWorkspace | null }).workspaces;
  return workspace ?? null;
}

export async function destroyOwnerSession(token: string): Promise<void> {
  await supabaseAdmin.from('owner_sessions').delete().eq('token_hash', hashToken(token));
}

/**
 * Cookie options for the owner session.
 *
 * No `maxAge`/`expires` — this is deliberate. A session cookie is what stops
 * student B from inheriting student A's ownership on a shared lab machine.
 */
export function ownerCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
  };
}
