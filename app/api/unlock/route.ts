import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { MAX_PASSWORD_LENGTH } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    // Password guessing on a shared link is the main brute-force surface here.
    const limited = await enforceRateLimit(request, 'file-unlock', 10, 15 * 60);
    if (limited) return limited;

    const body = await request.json();
    const { slug, type, password }: { slug?: string; type?: string; password?: string } = body;

    if (!slug || !type || !password || !password.trim()) {
      return NextResponse.json({ data: null, error: 'MISSING_FIELDS' }, { status: 400 });
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      return NextResponse.json({ data: null, error: 'WRONG_PASSWORD' }, { status: 401 });
    }

    const { data: fileRecord } = await supabaseAdmin
      .from('files')
      .select('password_hash')
      .eq('type', type)
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle();

    // Same response for "no such file" and "wrong password" so this endpoint
    // cannot be used to enumerate which private slugs exist.
    if (!fileRecord || !fileRecord.password_hash) {
      return NextResponse.json({ data: null, error: 'WRONG_PASSWORD' }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password.trim(), fileRecord.password_hash);
    if (!isValid) {
      return NextResponse.json({ data: null, error: 'WRONG_PASSWORD' }, { status: 401 });
    }

    const response = NextResponse.json({ data: { granted: true }, error: null });

    response.cookies.set(`file_unlock_${type}_${slug}`, 'granted', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      // Session-scoped: an unlocked file must not stay unlocked for the next
      // student who uses this lab PC.
      path: '/',
    });

    return response;
  } catch {
    return NextResponse.json({ data: null, error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
