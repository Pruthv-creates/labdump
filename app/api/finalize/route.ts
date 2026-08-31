import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getSessionWorkspace } from '@/lib/session';
import { enforceRateLimit } from '@/lib/rate-limit';
import { MAX_UPLOAD_BYTES, MAX_NOTE_CHARS, MAX_PASSWORD_LENGTH } from '@/lib/validation';
import { FileType, FileVisibility, ApiResponse } from '@/types/database';

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, 'finalize', 60, 60 * 60);
    if (limited) return limited;

    const body = await request.json();
    const {
      type,
      slug,
      storage_key,
      content,
      visibility = 'public',
      password,
      bundle_workspace_id,
    }: {
      type: FileType;
      slug: string;
      storage_key?: string;
      content?: string;
      visibility?: FileVisibility;
      password?: string;
      bundle_workspace_id?: string;
    } = body;

    if (!type || !slug) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Missing type or slug' },
        { status: 400 }
      );
    }

    if (visibility !== 'public' && visibility !== 'private') {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Invalid visibility' },
        { status: 400 }
      );
    }

    if (password && password.length > MAX_PASSWORD_LENGTH) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Password too long' },
        { status: 400 }
      );
    }

    // Trust the storage object, not the client, for size and MIME. The client
    // reports both, and a crafted request could otherwise claim a 1KB PNG while
    // storing a 5GB blob.
    let verifiedSize: number | null = null;
    let verifiedMime: string | null = null;

    if (type !== 'note') {
      if (!storage_key) {
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: 'Missing storage_key for file upload' },
          { status: 400 }
        );
      }

      // The storage key is derived server-side from the row's file_token, so it
      // must match this row. Otherwise a caller could point their row at
      // somebody else's object.
      const { data: ownRow } = await supabaseAdmin
        .from('files')
        .select('file_token')
        .eq('type', type)
        .eq('slug', slug)
        .eq('status', 'pending')
        .maybeSingle();

      if (!ownRow || !storage_key.startsWith(`${type}/${ownRow.file_token}/`)) {
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: 'Storage key does not belong to this record.' },
          { status: 403 }
        );
      }

      const folder = `${type}/${ownRow.file_token}`;
      const objectName = storage_key.slice(folder.length + 1);

      const { data: listed, error: listError } = await supabaseAdmin.storage
        .from('labdump-files')
        .list(folder, { search: objectName });

      const match = listed?.find((o) => o.name === objectName);

      if (listError || !match) {
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: 'Uploaded file verification failed in Supabase Storage.' },
          { status: 400 }
        );
      }

      verifiedSize = (match.metadata?.size as number | undefined) ?? null;
      verifiedMime = (match.metadata?.mimetype as string | undefined) ?? null;

      if (verifiedSize != null && verifiedSize > MAX_UPLOAD_BYTES) {
        // Reject and remove the oversized object so storage cannot be used as
        // free unbounded space.
        await supabaseAdmin.storage.from('labdump-files').remove([storage_key]);
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: 'File exceeds the 50MB limit.' },
          { status: 413 }
        );
      }
    } else if (content && content.length > MAX_NOTE_CHARS) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Note is too long.' },
        { status: 413 }
      );
    }

    // Workspace association.
    //
    // A file is filed under a workspace ONLY when the uploader is a verified
    // owner of one, or is adding to a bundle they just created. We never
    // auto-create a workspace and pin a long-lived cookie to the browser —
    // on a shared lab PC that handed the next student ownership of, and delete
    // rights over, the previous student's files.
    let targetWorkspaceId: string | null = null;

    if (bundle_workspace_id) {
      const { data: bundle } = await supabaseAdmin
        .from('workspaces')
        .select('id, mode')
        .eq('id', bundle_workspace_id)
        .maybeSingle();

      if (!bundle) {
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: 'Bundle not found' },
          { status: 404 }
        );
      }

      const sessionWorkspace = await getSessionWorkspace();
      const isOwner = sessionWorkspace?.id === bundle.id;

      // Only public bundles accept drops from non-owners.
      if (bundle.mode !== 'public' && !isOwner) {
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: 'UNAUTHORIZED' },
          { status: 403 }
        );
      }

      targetWorkspaceId = bundle.id;
    } else {
      const sessionWorkspace = await getSessionWorkspace();
      if (sessionWorkspace) {
        targetWorkspaceId = sessionWorkspace.id;
      }
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    let filePasswordHash: string | null = null;
    if (visibility === 'private') {
      if (!password || !password.trim()) {
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: 'Password required for a private file.' },
          { status: 400 }
        );
      }
      filePasswordHash = await bcrypt.hash(password.trim(), 12);
    }

    const updatePayload: Record<string, unknown> = {
      status: 'active',
      visibility,
      workspace_id: targetWorkspaceId,
      expires_at: expiresAt.toISOString(),
      password_hash: filePasswordHash,
    };

    if (type === 'note') {
      updatePayload.content = content || '';
    } else {
      updatePayload.storage_key = storage_key;
      updatePayload.size_bytes = verifiedSize;
      updatePayload.mime_type = verifiedMime;
    }

    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from('files')
      .update(updatePayload)
      .eq('type', type)
      .eq('slug', slug)
      .eq('status', 'pending')
      .select('id');

    if (updateError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: updateError.message },
        { status: 500 }
      );
    }

    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'This link has already been published and cannot be finalized again.' },
        { status: 409 }
      );
    }

    return NextResponse.json<ApiResponse<{ url: string }>>({
      data: { url: `/${type}/${slug}` },
      error: null,
    });
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
