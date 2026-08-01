import { NextResponse } from 'next/server';
import { verifyWorkspacePassword } from '@/lib/workspace';
import { ApiResponse } from '@/types/database';

const verifyRateLimitMap = new Map<string, { count: number; expiresAt: number }>();

function isVerifyRateLimited(ip: string, slug: string): boolean {
  const key = `${ip}:${slug}`;
  const now = Date.now();
  const entry = verifyRateLimitMap.get(key);

  if (!entry || now > entry.expiresAt) {
    verifyRateLimitMap.set(key, { count: 1, expiresAt: now + 60 * 60 * 1000 }); // 1 hour
    return false;
  }

  if (entry.count >= 10) {
    return true;
  }

  entry.count += 1;
  return false;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';
    const body = await request.json();
    const { slug, password }: { slug?: string; password?: string } = body;

    if (!slug || !password) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'MISSING_FIELDS' },
        { status: 400 }
      );
    }

    if (isVerifyRateLimited(ip, slug)) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'TOO_MANY_ATTEMPTS' },
        { status: 429 }
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
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
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
