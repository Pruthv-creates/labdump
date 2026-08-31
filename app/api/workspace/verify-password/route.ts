import { NextResponse } from 'next/server';
import { verifyWorkspacePassword } from '@/lib/workspace';
import { enforceRateLimit } from '@/lib/rate-limit';
import { MAX_PASSWORD_LENGTH } from '@/lib/validation';
import { ApiResponse } from '@/types/database';

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, 'workspace-verify', 10, 15 * 60);
    if (limited) return limited;

    const body = await request.json();
    const { slug, password }: { slug?: string; password?: string } = body;

    if (!slug || !password) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'WRONG_PASSWORD' },
        { status: 401 }
      );
    }

    const isValid = await verifyWorkspacePassword(slug, password);

    if (!isValid) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'WRONG_PASSWORD' },
        { status: 401 }
      );
    }

    const response = NextResponse.json<ApiResponse<{ granted: boolean }>>({
      data: { granted: true },
      error: null,
    });

    response.cookies.set(`workspace_access_${slug}`, 'granted', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      // Session-scoped on purpose — see the unlock route.
      path: '/',
    });

    return response;
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
