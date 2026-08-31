import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { OWNER_COOKIE, destroyOwnerSession } from '@/lib/session';

/**
 * Explicit sign-out. Essential on shared lab machines: a student who is done
 * can drop ownership immediately rather than relying on the browser closing.
 */
export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(OWNER_COOKIE)?.value;

  if (token) {
    await destroyOwnerSession(token);
  }

  const response = NextResponse.json({ data: { success: true }, error: null });
  response.cookies.delete(OWNER_COOKIE);
  return response;
}
