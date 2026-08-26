import { NextRequest, NextResponse } from "next/server";
import { hasDashboardSession, validateApiKey } from "@/lib/apiAuth";
import { isAuthDisabled } from "@/lib/security/auth";
import { isAllowedBrowserOrigin } from "@/lib/security/auth";

export function proxy(request: NextRequest) {
  if (isAuthDisabled()) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "API endpoints are disabled in demo mode" }, { status: 403 });
    }
    if (request.nextUrl.pathname !== "/" && request.nextUrl.pathname !== "/dashboard") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }
  if (request.nextUrl.pathname === "/api/auth") return NextResponse.next();
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(length) && length > 1024 * 1024) {
      return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
    }
    if (request.headers.has("transfer-encoding") && !request.headers.has("content-length")) {
      return NextResponse.json({ error: "Content-Length is required" }, { status: 411 });
    }
  }
  if (validateApiKey(request)) return NextResponse.next();
  if (hasDashboardSession(request)) {
    const origin = request.headers.get("origin") ?? undefined;
    if (!isAllowedBrowserOrigin(origin, request.nextUrl.origin)) {
      return NextResponse.json({ error: "Cross-origin request denied" }, { status: 403 });
    }
    return NextResponse.next();
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.svg).*)",
};
