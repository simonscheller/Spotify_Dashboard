import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const token = process.env.BASIC_AUTH_TOKEN;
  // If not configured, protection stays disabled.
  if (!token) return NextResponse.next();

  const pathname = req.nextUrl.pathname;
  const isPublicPath =
    pathname === "/login" ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico";
  if (isPublicPath) return NextResponse.next();

  const authCookie = req.cookies.get("site_auth")?.value;
  if (authCookie === token) {
    return NextResponse.next();
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/:path*"],
};

