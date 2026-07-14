import { NextResponse, type NextRequest } from "next/server";

export const ANON_COOKIE = "raah_anon";

/**
 * Anonymous-session cookie (ARCH §11): guests can generate 1 plan before signup —
 * never gate the magic moment. The id keys the server-side 1-free-plan allowance.
 */
export function middleware(req: NextRequest) {
  if (req.cookies.has(ANON_COOKIE)) return NextResponse.next();
  const res = NextResponse.next();
  res.cookies.set(ANON_COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
