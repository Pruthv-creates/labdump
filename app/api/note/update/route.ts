import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ApiResponse } from '@/types/database';

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { slug, content }: { slug?: string; content?: string } = body;

    if (!slug || typeof content !== 'string') {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Missing slug or content' },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data: fileRecord } = await supabaseAdmin
      .from('files')
      .select('id, visibility')
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

    if (fileRecord.visibility === 'private') {
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
        { data: null, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<{ success: true }>>({
      data: { success: true },
      error: null,
    });
  } catch (err: any) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
