import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { slug, type, password }: { slug?: string; type?: string; password?: string } = body;

    if (!slug || !type || !password) {
      return NextResponse.json({ data: null, error: 'MISSING_FIELDS' }, { status: 400 });
    }

    const { data: fileRecord } = await supabaseAdmin
      .from('files')
      .select('password_hash')
      .eq('type', type)
      .eq('slug', slug)
      .maybeSingle();

    if (!fileRecord || !fileRecord.password_hash) {
      return NextResponse.json({ data: null, error: 'FILE_NOT_FOUND' }, { status: 404 });
    }

    const isValid = await bcrypt.compare(password, fileRecord.password_hash);
    if (!isValid) {
      return NextResponse.json({ data: null, error: 'WRONG_PASSWORD' }, { status: 401 });
    }

    const response = NextResponse.json({ data: { granted: true }, error: null });

    response.cookies.set(`file_unlock_${type}_${slug}`, 'granted', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/',
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ data: null, error: err.message }, { status: 500 });
  }
}
