import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { generateSlug, isSlugValid } from '@/lib/slug';
import { enforceRateLimit } from '@/lib/rate-limit';
import { FileType, ApiResponse } from '@/types/database';

const VALID_TYPES: FileType[] = ['pdf', 'image', 'docx', 'audio', 'note', 'file'];

export async function POST(request: Request) {
  try {
    // Each call reserves a DB row, so this is the main way to flood the table.
    const limited = await enforceRateLimit(request, 'slug-reserve', 60, 60 * 60);
    if (limited) return limited;

    const body = await request.json();
    const type: FileType = body.type;
    const inputSlug: string | undefined = body.slug ? String(body.slug).trim().toLowerCase() : undefined;

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Invalid file type.' },
        { status: 400 }
      );
    }

    let targetSlug: string;

    if (inputSlug) {
      if (!isSlugValid(inputSlug)) {
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: 'Invalid custom slug. Must be 3-30 lowercase alphanumeric characters or hyphens, and not reserved.' },
          { status: 400 }
        );
      }
      targetSlug = inputSlug;
    } else {
      targetSlug = generateSlug();
    }

    const { data: existingFile, error: checkError } = await supabaseAdmin
      .from('files')
      .select('id')
      .eq('type', type)
      .eq('slug', targetSlug)
      .maybeSingle();

    if (checkError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Could not reserve this link.' },
        { status: 500 }
      );
    }

    if (existingFile) {
      const alt1 = `${targetSlug}-2`;
      const alt2 = `${targetSlug}-3`;
      const alt3 = `${targetSlug}-${generateSlug().slice(0, 4)}`;

      return NextResponse.json<ApiResponse<null>>(
        {
          data: null,
          error: `Slug "${targetSlug}" is already taken. Alternatives: ${alt1}, ${alt2}, ${alt3}`,
        },
        { status: 409 }
      );
    }

    // Pending rows start with no workspace. Association happens at finalize,
    // and only for a verified owner — we no longer mint a throwaway workspace
    // here, which used to leave orphan rows behind on every abandoned upload.
    const defaultExpiry = new Date();
    defaultExpiry.setMonth(defaultExpiry.getMonth() + 6);

    const { error: insertError } = await supabaseAdmin
      .from('files')
      .insert({
        type,
        slug: targetSlug,
        status: 'pending',
        workspace_id: null,
        expires_at: defaultExpiry.toISOString(),
      });

    if (insertError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: 'Could not reserve this link.' },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<{ slug: string; type: FileType }>>({
      data: { slug: targetSlug, type },
      error: null,
    });
  } catch {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
