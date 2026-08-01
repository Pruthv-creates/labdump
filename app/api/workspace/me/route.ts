import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getWorkspaceByToken } from '@/lib/workspace';
import { ApiResponse, WorkspaceMode } from '@/types/database';

export async function GET() {
  try {
    const headerList = await headers();
    const ownerToken = headerList.get('x-owner-token');

    if (!ownerToken) {
      return NextResponse.json<ApiResponse<null>>({
        data: null,
        error: null,
      });
    }

    const workspace = await getWorkspaceByToken(ownerToken);
    if (!workspace) {
      return NextResponse.json<ApiResponse<null>>({
        data: null,
        error: null,
      });
    }

    return NextResponse.json<ApiResponse<{ slug: string; name: string; mode: WorkspaceMode }>>({
      data: {
        slug: workspace.slug,
        name: workspace.name,
        mode: workspace.mode,
      },
      error: null,
    });
  } catch (err: any) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: err.message || 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
