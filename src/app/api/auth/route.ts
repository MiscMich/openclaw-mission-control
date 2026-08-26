import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import {
  authConfigurationError,
  createSessionToken,
  getSessionSecret,
  isAuthDisabled,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "@/lib/security/auth";
import { readBoundedJsonObject, RequestBoundaryError } from "@/lib/security/request";

export async function POST(request: Request) {
  if (isAuthDisabled()) return NextResponse.json({ ok: true, demo: true });

  const configurationError = authConfigurationError();
  if (configurationError) {
    console.error(`Authentication unavailable: ${configurationError}`);
    return NextResponse.json({ ok: false, error: "Authentication is not configured" }, { status: 503 });
  }

  try {
    const body = await readBoundedJsonObject(request, 4 * 1024);
    const password = typeof body.password === "string" ? body.password : "";
    const hash = process.env.PASSWORD_HASH as string;
    const ok = password.length <= 1024 && (await bcrypt.compare(password, hash));
    if (!ok) return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });

    const secret = getSessionSecret() as string;
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, createSessionToken({ secret }), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
      path: "/",
    });
    return response;
  } catch (error) {
    const status = error instanceof RequestBoundaryError ? error.status : 400;
    return NextResponse.json({ ok: false, error: "Invalid login request" }, { status });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
  return response;
}
