import { NextResponse } from 'next/server';
import { createWorkspace, getWorkspaceBySlug, isWorkspaceSlugValid } from '@/lib/workspace';
import { createOwnerSession, OWNER_COOKIE, ownerCookieOptions } from '@/lib/session';
import { enforceRateLimit } from '@/lib/rate-limit';
import { MAX_PASSWORD_LENGTH } from '@/lib/validation';
import { WorkspaceMode, ApiResponse } from '@/types/database';

const VALID_MODES: WorkspaceMode[] = ['private', 'public', 'protected'];

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, 'workspace-create', 10, 60 * 60);
    if (limited) return limited;

    const body = await request.json();
    const { name, slug, mode, password }: {
      name?: string;
      slug?: string;
      mode?: WorkspaceMode;
      password?: string;
    } = body;

    if (!name || !slug || !mode) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }

    if (!VALID_MODES.includes(mode)) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'INVALID_MODE' },
        { status: 400 }
      );
    }

    if (name.trim().length > 60) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'NAME_TOO_LONG' },
        { status: 400 }
      );
    }

    if (password && password.length > MAX_PASSWORD_LENGTH) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'PASSWORD_TOO_LONG' },
        { status: 400 }
      );
    }

    const cleanSlug = slug.trim().toLowerCase();
    if (!isWorkspaceSlugValid(cleanSlug)) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'INVALID_SLUG' },
        { status: 400 }
      );
    }

    const existing = await getWorkspaceBySlug(cleanSlug);
    if (existing) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'SLUG_TAKEN' },
        { status: 409 }
      );
    }

    const { workspace, recoveryKey } = await createWorkspace(name, cleanSlug, mode, password);

    const response = NextResponse.json<
      ApiResponse<{ slug: string; mode: WorkspaceMode; name: string; recoveryKey: string }>
    >({
      data: {
        slug: workspace.slug,
        mode: workspace.mode,
        name: workspace.name,
        // Shown once, at creation. It is not recoverable later.
        recoveryKey,
      },
      error: null,
    });

    const token = await createOwnerSession(workspace.id);
    response.cookies.set(OWNER_COOKIE, token, ownerCookieOptions());

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'INTERNAL_ERROR';
    const known = ['INVALID_SLUG', 'PASSWORD_REQUIRED'].includes(message);
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: known ? message : 'INTERNAL_ERROR' },
      { status: known ? 400 : 500 }
    );
  }
}
