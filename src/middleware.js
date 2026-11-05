import { NextResponse } from 'next/server';

// First check only: is there a session cookie at all? Pages and routes still verify the signature
// and the role themselves, because middleware alone is not enough.
export function middleware(request) {
  if (!request.cookies.has('seo_session')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/client/:path*'],
};
