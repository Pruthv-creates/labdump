import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getWorkspaceByToken } from '@/lib/workspace';
import { FileType, FileVisibility, ApiResponse } from '@/types/database';

export async function POST(request: Request) {
  try {
    const headerList = await headers();
    const ownerToken = headerList.get('x-owner-token');

    const body = await request.json();
    const {
      type,
      slug,
      storage_key,
      size_bytes,
      mime_type,
      content,
      visibility = 'public',
      password,
      bundle_workspace_id,
    }: {
      type: FileType;
      slug: string;
      storage_key?: string;
      size_bytes?: number;
      mime_type?: string;
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

    if (type !== 'note') {
      if (!storage_key) {
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: 'Missing storage_key for file upload' },
          { status: 400 }
        );
      }

      // Verify object actually exists in storage bucket
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from('labdump-files')
        .download(storage_key);

      if (downloadError || !fileData) {
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: 'Uploaded file verification failed in Supabase Storage.' },
          { status: 400 }
        );
      }
    }

    // Handle workspace association
    let targetWorkspaceId: string | null = null;
    let newWorkspaceCreated: { id: string; slug: string } | null = null;

    if (bundle_workspace_id) {
      targetWorkspaceId = bundle_workspace_id;
    } else if (ownerToken) {
      const workspace = await getWorkspaceByToken(ownerToken);
      if (workspace) {
        targetWorkspaceId = workspace.id;
      }
    }

    // Default private workspace fallback if no workspace found
    if (!targetWorkspaceId) {
      const autoSlug = `ws-${Math.random().toString(36).substring(2, 8)}`;
      const { data: defaultWs, error: wsErr } = await supabaseAdmin
        .from('workspaces')
        .insert({
          name: 'default',
          slug: autoSlug,
          type: 'private',
          mode: 'private',
        })
        .select('id, slug')
        .single();

      if (wsErr || !defaultWs) {
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: wsErr?.message || 'Failed to auto-create workspace' },
          { status: 500 }
        );
      }

      targetWorkspaceId = defaultWs.id;
      newWorkspaceCreated = defaultWs;
    }

    // Set expires_at to now() + 6 months
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    let filePasswordHash: string | null = null;
    if (visibility === 'private' && password && password.trim()) {
      filePasswordHash = await bcrypt.hash(password.trim(), 10);
    }

    const updatePayload: Record<string, any> = {
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
      updatePayload.size_bytes = size_bytes || null;
      updatePayload.mime_type = mime_type || null;
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

    const response = NextResponse.json<ApiResponse<{ url: string }>>({
      data: { url: `/${type}/${slug}` },
      error: null,
    });

    if (newWorkspaceCreated) {
      response.cookies.set('owner_token', newWorkspaceCreated.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 365 * 24 * 60 * 60,
        path: '/',
      });
    }

    return response;
  } catch (err: any) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
