import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "vtres60_admin_session";
const SESSION_DURATION = 60 * 60 * 12;

function password() { return process.env.ADMIN_PASSWORD ?? "" }
function signature(timestamp: string) { return createHmac("sha256", `vtres60:${password()}`).update(timestamp).digest("hex") }

export function createAdminSession() {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return `${timestamp}.${signature(timestamp)}`;
}

export function verifyAdminSession(token?: string) {
  if (!token || !password()) return false;
  const [timestamp, supplied] = token.split(".");
  if (!timestamp || !supplied || Date.now() / 1000 - Number(timestamp) > SESSION_DURATION) return false;
  const expected = signature(timestamp);
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function isAdminAuthenticated() {
  return verifyAdminSession((await cookies()).get(ADMIN_COOKIE)?.value);
}

export function isAdminPassword(candidate: string) {
  const expected = password();
  if (!expected || candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

export function adminCookieOptions() {
  return { httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DURATION };
}
