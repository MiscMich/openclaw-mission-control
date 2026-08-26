import { NextRequest, NextResponse } from "next/server";
import {
  getSessionSecret,
  isAuthDisabled,
  secureEqual,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/security/auth";

type ApiRouteHandler<TArgs extends unknown[] = []> = (
  request: NextRequest,
  ...args: TArgs
) => Promise<Response>;

export { isAuthDisabled } from "@/lib/security/auth";

export function hasDashboardSession(request: NextRequest): boolean {
  if (isAuthDisabled()) return true;
  const secret = getSessionSecret();
  return secret
    ? verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, { secret })
    : false;
}

export function validateApiKey(request: NextRequest): boolean {
  if (isAuthDisabled()) return true;
  const supplied = request.headers.get("x-api-key") ?? "";
  const configured = process.env.AGENT_API_KEY?.trim() ?? "";
  return configured.length >= 32 && supplied.length > 0 && secureEqual(supplied, configured);
}

export function withAuth<TArgs extends unknown[]>(
  handler: ApiRouteHandler<TArgs>
): ApiRouteHandler<TArgs> {
  return async (request: NextRequest, ...args: TArgs) => {
    if (!hasDashboardSession(request) && !validateApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(request, ...args);
  };
}
