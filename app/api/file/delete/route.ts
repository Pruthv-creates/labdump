import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getSessionWorkspace } from '@/lib/session';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function DELETE(request: Request) {
  try {
    // Bound how fast any one client can delete, so a stolen session cannot be
    // used to clear a whole workspace in a single burst.
    const limited = await enforceRateLimit(request, 'file-delete', 30, 60 * 60);
    if (limited) return limited;

    const workspace = await getSessionWorkspace();
    if (!workspace) {
      return NextResponse.json({ data: null, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawId = searchParams.get('id');

    // Must be a single numeric id. Without this, a value like "1&id=2" or a
    // PostgREST operator string could widen the filter far beyond one row.
    if (!rawId || !/^\d+$/.test(rawId)) {
      return NextResponse.json({ data: null, error: 'INVALID_ID' }, { status: 400 });
    }

    const fileId = Number(rawId);

    // Confirm the row exists AND belongs to this workspace before deleting, so
    // the response cannot be used to probe for other people's file ids.
    const { data: target } = await supabaseAdmin
      .from('files')
      .select('id, storage_key, workspace_id')
      .eq('id', fileId)
      .maybeSingle();

    if (!target || target.workspace_id !== workspace.id) {
      return NextResponse.json({ data: null, error: 'NOT_FOUND' }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from('files')
      .delete()
      .eq('id', fileId)
      .eq('workspace_id', workspace.id);

    if (error) {
      return NextResponse.json({ data: null, error: 'DELETE_FAILED' }, { status: 500 });
    }

    // Remove the stored object too, so deleted files leave nothing behind.
    if (target.storage_key) {
      await supabaseAdmin.storage.from('labdump-files').remove([target.storage_key]);
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch {
    return NextResponse.json({ data: null, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
