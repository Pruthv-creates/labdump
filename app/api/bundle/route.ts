import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { generateSlug } from '@/lib/slug';
import { isWorkspaceSlugValid } from '@/lib/workspace';
import { ApiResponse } from '@/types/database';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const inputSlug: string | undefined = body.slug ? body.slug.trim().toLowerCase() : undefined;

    let targetSlug: string;

    if (inputSlug) {
      if (!isWorkspaceSlugValid(inputSlug)) {
        return NextResponse.json<ApiResponse<null>>(
          { data: null, error: 'Invalid custom link. Must be 3-30 lowercase alphanumeric characters or hyphens, and not reserved.' },
          { status: 400 }
        );
      }
      targetSlug = inputSlug;
    } else {
      targetSlug = generateSlug();
    }

    const { data: existing } = await supabaseAdmin
      .from('workspaces')
      .select('id')
      .eq('slug', targetSlug)
      .maybeSingle();

    if (existing) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: `Link "${targetSlug}" is already taken.` },
        { status: 409 }
      );
    }

    const { data: bundle, error } = await supabaseAdmin
      .from('workspaces')
      .insert({
        name: 'Bundle',
        slug: targetSlug,
        type: 'public',
        mode: 'public',
      })
      .select('id, slug')
      .single();

    if (error || !bundle) {
      return NextResponse.json<ApiResponse<null>>(
        { data: null, error: error?.message || 'Failed to create bundle' },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<{ id: string; slug: string }>>({
      data: { id: bundle.id, slug: bundle.slug },
      error: null,
    });
  } catch (err: any) {
    return NextResponse.json<ApiResponse<null>>(
      { data: null, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
