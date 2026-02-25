import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPass = process.env.BASIC_AUTH_PASS;
  const authToken = process.env.BASIC_AUTH_TOKEN;

  if (!expectedUser || !expectedPass || !authToken) {
    return NextResponse.json(
      { ok: false, error: "Auth not configured" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const user = typeof body?.user === "string" ? body.user : "";
  const pass = typeof body?.pass === "string" ? body.pass : "";
  const next = typeof body?.next === "string" && body.next.startsWith("/") ? body.next : "/";

  if (user !== expectedUser || pass !== expectedPass) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set("site_auth", authToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12h
  });

  return NextResponse.json({ ok: true, next });
}

