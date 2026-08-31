import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/server';
import { SupabaseWorkspace, WorkspaceMode } from '@/types/database';

const RESERVED_WORKSPACE_SLUGS = new Set([
  'admin',
  'api',
  'upload',
  'w',
  'bundle',
  'public',
  'share',
  'restore',
  'create',
  'health',
  'labdump',
]);

export async function getWorkspaceBySlug(slug: string): Promise<SupabaseWorkspace | null> {
  if (!slug) return null;
  const { data, error } = await supabaseAdmin
    .from('workspaces')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) return null;
  return data as SupabaseWorkspace;
}

export function isWorkspaceSlugValid(slug: string): boolean {
  if (!slug || slug.length < 3 || slug.length > 30) return false;
  const validRegex = /^[a-z0-9-]+$/;
  if (!validRegex.test(slug)) return false;
  if (RESERVED_WORKSPACE_SLUGS.has(slug)) return false;
  return true;
}

function hashRecoveryKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Look up a workspace by its recovery key.
 *
 * The key is a dedicated random secret, deliberately NOT the workspace UUID.
 * Previously the UUID served as both the public row id and the recovery
 * credential, so anyone who learned it — from a shared cookie, a log, or a
 * URL — gained permanent ownership.
 */
export async function findWorkspaceByRecoveryKey(key: string): Promise<SupabaseWorkspace | null> {
  if (!key) return null;

  const { data, error } = await supabaseAdmin
    .from('workspaces')
    .select('*')
    .eq('recovery_key_hash', hashRecoveryKey(key))
    .maybeSingle();

  if (error || !data) return null;
  return data as SupabaseWorkspace;
}

export async function createWorkspace(
  name: string,
  slug: string,
  mode: WorkspaceMode,
  password?: string
): Promise<{ workspace: SupabaseWorkspace; recoveryKey: string }> {
  const cleanSlug = slug.trim().toLowerCase();
  if (!isWorkspaceSlugValid(cleanSlug)) {
    throw new Error('INVALID_SLUG');
  }

  let passwordHash: string | null = null;
  if (mode === 'protected') {
    if (!password || !password.trim()) {
      throw new Error('PASSWORD_REQUIRED');
    }
    passwordHash = await bcrypt.hash(password.trim(), 12);
  }

  const recoveryKey = randomBytes(24).toString('base64url');

  const { data, error } = await supabaseAdmin
    .from('workspaces')
    .insert({
      name: name.trim(),
      slug: cleanSlug,
      mode,
      type: mode === 'public' ? 'public' : 'private',
      password_hash: passwordHash,
      recovery_key_hash: hashRecoveryKey(recoveryKey),
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'FAILED_TO_CREATE_WORKSPACE');
  }

  return { workspace: data as SupabaseWorkspace, recoveryKey };
}

export async function verifyWorkspacePassword(slug: string, password?: string): Promise<boolean> {
  if (!slug || !password || !password.trim()) return false;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace || !workspace.password_hash) return false;
  return await bcrypt.compare(password.trim(), workspace.password_hash);
}
