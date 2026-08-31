import { NextResponse } from 'next/server';
import { isWorkspaceSlugValid, getWorkspaceBySlug } from '@/lib/workspace';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ApiResponse } from '@/types/database';

export async function GET(request: Request) {
  try {
    const limited = await enforceRateLimit(request, 'check-slug', 30, 60);
    if (limited) return limited;

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
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
