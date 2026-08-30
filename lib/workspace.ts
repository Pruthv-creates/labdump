import bcrypt from 'bcryptjs';
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

export async function getWorkspaceByToken(token: string): Promise<SupabaseWorkspace | null> {
  if (!token) return null;
  const { data, error } = await supabaseAdmin
    .from('workspaces')
    .select('*')
    .eq('id', token)
    .maybeSingle();

  if (error || !data) return null;
  return data as SupabaseWorkspace;
}

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

export async function isWorkspaceOwner(token: string, slug: string): Promise<boolean> {
  if (!token || !slug) return false;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) return false;
  return workspace.id === token;
}

export function isWorkspaceSlugValid(slug: string): boolean {
  if (!slug || slug.length < 3 || slug.length > 30) return false;
  const validRegex = /^[a-z0-9-]+$/;
  if (!validRegex.test(slug)) return false;
  if (RESERVED_WORKSPACE_SLUGS.has(slug)) return false;
  return true;
}

export async function createWorkspace(
  name: string,
  slug: string,
  mode: WorkspaceMode,
  password?: string
): Promise<SupabaseWorkspace> {
  const cleanSlug = slug.trim().toLowerCase();
  if (!isWorkspaceSlugValid(cleanSlug)) {
    throw new Error('INVALID_SLUG');
  }

  let passwordHash: string | null = null;
  if (mode === 'protected') {
    if (!password || !password.trim()) {
      throw new Error('PASSWORD_REQUIRED');
    }
    passwordHash = await bcrypt.hash(password.trim(), 10);
  }

  const { data, error } = await supabaseAdmin
    .from('workspaces')
    .insert({
      name: name.trim(),
      slug: cleanSlug,
      mode,
      type: mode === 'public' ? 'public' : 'private',
      password_hash: passwordHash,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'FAILED_TO_CREATE_WORKSPACE');
  }

  return data as SupabaseWorkspace;
}

export async function verifyWorkspacePassword(slug: string, password?: string): Promise<boolean> {
  if (!slug || !password || !password.trim()) return false;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace || !workspace.password_hash) return false;
  return await bcrypt.compare(password.trim(), workspace.password_hash);
}
