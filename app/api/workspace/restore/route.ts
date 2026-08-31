import { NextResponse } from 'next/server';
import { findWorkspaceByRecoveryKey } from '@/lib/workspace';
import { createOwnerSession, OWNER_COOKIE, ownerCookieOptions } from '@/lib/session';
import { enforceRateLimit } from '@/lib/rate-limit';
import { WorkspaceMode, ApiResponse } from '@/types/database';

export async function POST(request: Request) {
  try {
    // Recovery keys are the one long-lived secret in the system, so this
    // endpoint is the most attractive brute-force target. The limit is shared
    // across serverless instances and keyed on a platform-verified IP.
    const limited = await enforceRateLimit(request, 'workspace-restore', 5, 60 * 60);
    if (limited) return limited;

    const body = await request.json();
    const { token }: { token?: string } = body;

    if (!token || typeof token !== 'string' || token.length > 200) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'INVALID_TOKEN' },
        { status: 400 }
      );
    }

    const workspace = await findWorkspaceByRecoveryKey(token.trim());
    if (!workspace) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'INVALID_TOKEN' },
        { status: 404 }
      );
    }

    const response = NextResponse.json<
      ApiResponse<{ slug: string; name: string; mode: WorkspaceMode }>
    >({
      data: {
        slug: workspace.slug,
        name: workspace.name,
        mode: workspace.mode,
      },
      error: null,
    });

    const sessionToken = await createOwnerSession(workspace.id);
    response.cookies.set(OWNER_COOKIE, sessionToken, ownerCookieOptions());

    return response;
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
