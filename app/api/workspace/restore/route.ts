import { NextResponse } from 'next/server';
import { getWorkspaceByToken } from '@/lib/workspace';
import { WorkspaceMode, ApiResponse } from '@/types/database';

const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.expiresAt) {
    rateLimitMap.set(ip, { count: 1, expiresAt: now + 60 * 60 * 1000 }); // 1 hour
    return false;
  }

  if (entry.count >= 5) {
    return true;
  }

  entry.count += 1;
  return false;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

    if (isRateLimited(ip)) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'RATE_LIMIT_EXCEEDED' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { token }: { token?: string } = body;

    if (!token) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'INVALID_TOKEN' },
        { status: 400 }
      );
    }

    const workspace = await getWorkspaceByToken(token.trim());
    if (!workspace) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'INVALID_TOKEN' },
        { status: 404 }
      );
    }

    const response = NextResponse.json<ApiResponse<{ slug: string; name: string; mode: WorkspaceMode }>>({
      data: {
        slug: workspace.slug,
        name: workspace.name,
        mode: workspace.mode,
      },
      error: null,
    });

    response.cookies.set('owner_token', workspace.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60,
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
