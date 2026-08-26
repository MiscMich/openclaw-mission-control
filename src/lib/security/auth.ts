import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SESSION_VERSION = "v1";
export const SESSION_COOKIE = "openclaw_mc_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const MIN_SESSION_SECRET_LENGTH = 32;
export const PUBLIC_RELEASE_DEMO_ONLY = true;

export function isAuthDisabled(): boolean {
  // The public release intentionally ships no operational HTTP surface.
  // Retained live-mode code is not reachable until a future release provides
  // an end-to-end authenticated server adapter and migration path.
  return PUBLIC_RELEASE_DEMO_ONLY;
}

export function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    const padded = Buffer.alloc(leftBuffer.length);
    rightBuffer.copy(padded, 0, 0, Math.min(rightBuffer.length, padded.length));
    timingSafeEqual(leftBuffer, padded);
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function isAllowedBrowserOrigin(origin: string | undefined, requestOrigin: string): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(requestOrigin).origin;
  } catch {
    return false;
  }
}

function requireStrongSecret(secret: string): void {
  if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters`);
  }
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(options: {
  secret: string;
  now?: number;
  ttlMs?: number;
}): string {
  requireStrongSecret(options.secret);
  const now = options.now ?? Date.now();
  const expiresAt = now + (options.ttlMs ?? SESSION_TTL_MS);
  const payload = `${SESSION_VERSION}.${expiresAt}.${randomBytes(18).toString("base64url")}`;
  return `${payload}.${signature(payload, options.secret)}`;
}

export function verifySessionToken(
  token: string | undefined,
  options: { secret: string; now?: number }
): boolean {
  if (!token || options.secret.length < MIN_SESSION_SECRET_LENGTH) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== SESSION_VERSION) return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < (options.now ?? Date.now())) return false;
  const payload = parts.slice(0, 3).join(".");
  return secureEqual(parts[3], signature(payload, options.secret));
}

export function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET?.trim() ?? "";
  return secret.length >= MIN_SESSION_SECRET_LENGTH ? secret : null;
}

export function authConfigurationError(): string | null {
  if (isAuthDisabled()) return null;
  if (!process.env.PASSWORD_HASH?.trim()) return "PASSWORD_HASH is not configured";
  if (!getSessionSecret()) return `SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters`;
  return null;
}
