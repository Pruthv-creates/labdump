import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getSessionWorkspace } from '@/lib/session';
import { enforceRateLimit } from '@/lib/rate-limit';
import { MAX_NOTE_CHARS } from '@/lib/validation';
import { ApiResponse } from '@/types/database';

export async function PATCH(request: Request) {
  try {
    const limited = await enforceRateLimit(request, 'note-update', 60, 60 * 60);
    if (limited) return limited;

    const body = await request.json();
    const { slug, content }: { slug?: string; content?: string } = body;

    if (!slug || typeof content !== 'string') {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Missing slug or content' },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    if (content.length > MAX_NOTE_CHARS) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Note is too long.' },
        { status: 413 }
      );
    }

    const { data: fileRecord } = await supabaseAdmin
      .from('files')
      .select('id, visibility, workspace_id')
      .eq('type', 'note')
      .eq('slug', slug)
      .eq('status', 'active')
      .gt('expires_at', nowIso)
      .maybeSingle();

    if (!fileRecord) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Note not found' },
        { status: 404 }
      );
    }

    // A note owned by a workspace is editable only by that workspace's owner.
    // Private notes additionally require the unlock cookie. An unowned public
    // note stays open — that is the anonymous quick-share case.
    if (fileRecord.workspace_id) {
      const sessionWorkspace = await getSessionWorkspace();
      if (sessionWorkspace?.id !== fileRecord.workspace_id) {
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: 'UNAUTHORIZED' },
          { status: 401 }
        );
      }
    } else if (fileRecord.visibility === 'private') {
      const cookieStore = await cookies();
      const isUnlocked = cookieStore.get(`file_unlock_note_${slug}`)?.value === 'granted';

      if (!isUnlocked) {
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: 'UNAUTHORIZED' },
          { status: 401 }
        );
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('files')
      .update({ content })
      .eq('id', fileRecord.id);

    if (updateError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'FAILED_TO_SAVE' },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<{ success: true }>>({
      data: { success: true },
      error: null,
    });
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
