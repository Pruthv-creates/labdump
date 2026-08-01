import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getWorkspaceByToken } from '@/lib/workspace';

export async function DELETE(request: Request) {
  try {
    const headerList = await headers();
    const ownerToken = headerList.get('x-owner-token');

    if (!ownerToken) {
      return NextResponse.json({ data: null, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const workspace = await getWorkspaceByToken(ownerToken);
    if (!workspace) {
      return NextResponse.json({ data: null, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('id');

    if (!fileId) {
      return NextResponse.json({ data: null, error: 'MISSING_ID' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('files')
      .delete()
      .eq('id', fileId)
      .eq('workspace_id', workspace.id);

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (err: any) {
    return NextResponse.json({ data: null, error: err.message }, { status: 500 });
  }
}
