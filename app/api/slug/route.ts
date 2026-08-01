import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { generateSlug, isSlugValid } from '@/lib/slug';
import { FileType, ApiResponse } from '@/types/database';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const type: FileType = body.type;
    const inputSlug: string | undefined = body.slug ? body.slug.trim().toLowerCase() : undefined;

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

    // Check (type, slug) uniqueness in files table
    const { data: existingFile, error: checkError } = await supabaseAdmin
      .from('files')
      .select('id')
      .eq('type', type)
      .eq('slug', targetSlug)
      .maybeSingle();

    if (checkError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: checkError.message },
        { status: 500 }
      );
    }

    if (existingFile) {
      // Taken: generate 3 alternatives
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

    // Create temporary private workspace row
    const { data: workspace, error: wsError } = await supabaseAdmin
      .from('workspaces')
      .insert({
        name: 'Temporary Workspace',
        type: 'private',
      })
      .select('id')
      .single();

    if (wsError || !workspace) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: wsError?.message || 'Failed to create workspace' },
        { status: 500 }
      );
    }

    // Insert pending file row
    // Default expires_at to 6 months from now in case pending cleanup needed
    const defaultExpiry = new Date();
    defaultExpiry.setMonth(defaultExpiry.getMonth() + 6);

    const { error: insertError } = await supabaseAdmin
      .from('files')
      .insert({
        type,
        slug: targetSlug,
        status: 'pending',
        workspace_id: workspace.id,
        expires_at: defaultExpiry.toISOString(),
      });

    if (insertError) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<{ slug: string; type: FileType }>>({
      data: { slug: targetSlug, type },
      error: null,
    });
  } catch (err: any) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
