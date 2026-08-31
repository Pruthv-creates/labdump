import { NextResponse } from 'next/server';
import { getSessionWorkspace } from '@/lib/session';
import { ApiResponse, WorkspaceMode } from '@/types/database';

export async function GET() {
  try {
    const workspace = await getSessionWorkspace();

    if (!workspace) {
      return NextResponse.json<ApiResponse<null>>({ data: null, error: null });
    }

    return NextResponse.json<ApiResponse<{ slug: string; name: string; mode: WorkspaceMode }>>({
      data: {
        slug: workspace.slug,
        name: workspace.name,
        mode: workspace.mode,
      },
      error: null,
    });
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
