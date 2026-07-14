import { decode } from "@auth/core/jwt";
import { loadEnv } from "@raah/shared/env";
import type { Session } from "./context";

const env = loadEnv();

const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"] as const;
const ANON_COOKIE = "raah_anon";

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/**
 * Verify the Auth.js JWT session cookie (issued by apps/web) without a DB hit.
 * Salt must equal the cookie name — Auth.js derives the encryption key from
 * (secret, salt), so both cookie variants are tried.
 */
export async function sessionFromCookieHeader(cookieHeader: string | undefined): Promise<Session> {
  const cookies = parseCookies(cookieHeader);
  const anonymousId = cookies[ANON_COOKIE] ?? null;

  for (const name of SESSION_COOKIES) {
    const token = cookies[name];
    if (!token) continue;
    try {
      const payload = await decode({ token, secret: env.AUTH_SECRET, salt: name });
      const userId = typeof payload?.userId === "string" ? payload.userId : null;
      if (userId) return { userId, anonymousId };
    } catch {
      // invalid/expired token → treated as signed out
    }
  }
  return { userId: null, anonymousId };
}
