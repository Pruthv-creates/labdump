import { NextResponse } from 'next/server';
import { isWorkspaceSlugValid, getWorkspaceBySlug } from '@/lib/workspace';
import { ApiResponse } from '@/types/database';

const checkSlugRateLimitMap = new Map<string, { count: number; expiresAt: number }>();

function isCheckSlugRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = checkSlugRateLimitMap.get(ip);

  if (!entry || now > entry.expiresAt) {
    checkSlugRateLimitMap.set(ip, { count: 1, expiresAt: now + 60 * 1000 }); // 1 minute
    return false;
  }

  if (entry.count >= 30) {
    return true;
  }

  entry.count += 1;
  return false;
}

export async function GET(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

    if (isCheckSlugRateLimited(ip)) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'RATE_LIMIT_EXCEEDED' },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug')?.trim().toLowerCase();

    if (!slug || !isWorkspaceSlugValid(slug)) {
      return NextResponse.json<ApiResponse<{ available: boolean }>>({
        data: { available: false },
        error: null,
      });
    }

    const existing = await getWorkspaceBySlug(slug);

    return NextResponse.json<ApiResponse<{ available: boolean }>>({
      data: { available: !existing },
      error: null,
    });
  } catch (err: any) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: err.message || 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
