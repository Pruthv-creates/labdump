import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * The previous middleware copied the owner cookie into an `x-owner-token`
 * header, and route handlers trusted that header. Since a client can send any
 * header it likes, anyone could forge `x-owner-token: <workspace uuid>` and act
 * as the owner of that workspace.
 *
 * Ownership is now resolved server-side from the session cookie (see
 * lib/session.ts). This proxy exists only to STRIP client-supplied copies of
 * the trusted headers so a forged one can never reach a route handler.
 */

const FORBIDDEN_CLIENT_HEADERS = ['x-owner-token', 'x-workspace-id'];

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);

  for (const header of FORBIDDEN_CLIENT_HEADERS) {
    headers.delete(header);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
