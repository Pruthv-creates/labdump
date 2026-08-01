import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { FileType, ApiResponse } from '@/types/database';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, slug, filename, mimeType }: { type: FileType; slug: string; filename: string; mimeType: string } = body;

    if (!type || !slug || !filename || !mimeType) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Missing required parameters: type, slug, filename, mimeType' },
        { status: 400 }
      );
    }

    // Look up pending file record
    const { data: fileRecord, error: fetchError } = await supabaseAdmin
      .from('files')
      .select('file_token, status')
      .eq('type', type)
      .eq('slug', slug)
      .maybeSingle();

    if (fetchError || !fileRecord) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: fetchError?.message || 'Reserved file record not found' },
        { status: 404 }
      );
    }

    const storage_key = `${type}/${fileRecord.file_token}/${filename}`;

    // Create signed upload URL
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('labdump-files')
      .createSignedUploadUrl(storage_key);

    if (uploadError || !uploadData) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: uploadError?.message || 'Failed to create signed upload URL' },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<{ signedUrl: string; storage_key: string }>>({
      data: {
        signedUrl: uploadData.signedUrl,
        storage_key,
      },
      error: null,
    });
  } catch (err: any) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
