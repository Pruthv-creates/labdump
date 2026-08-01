import { NextResponse } from 'next/server';
import { createWorkspace, getWorkspaceBySlug, isWorkspaceSlugValid } from '@/lib/workspace';
import { WorkspaceMode, ApiResponse } from '@/types/database';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, slug, mode, password }: { name?: string; slug?: string; mode?: WorkspaceMode; password?: string } = body;

    if (!name || !slug || !mode) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'MISSING_FIELDS' },
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

    const workspace = await createWorkspace(name, cleanSlug, mode, password);

    const response = NextResponse.json<ApiResponse<{ slug: string; mode: WorkspaceMode; name: string }>>({
      data: {
        slug: workspace.slug,
        mode: workspace.mode,
        name: workspace.name,
      },
      error: null,
    });

    // Set owner_token cookie
    response.cookies.set('owner_token', workspace.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60, // 365 days
      path: '/',
    });

    return response;
  } catch (err: any) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: err.message || 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
