import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminCookieOptions, createAdminSession, isAdminPassword } from "@/lib/admin-auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "ADMIN_PASSWORD nao configurada no ambiente." }, { status: 503 });
  }

  const ip = getClientIp(request);
  const limited = rateLimit(`admin-login:${ip}`, 8, 15 * 60 * 1000);
  if (limited.limited) {
    return NextResponse.json({ error: "Muitas tentativas. Tente novamente em alguns minutos." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  if (!body?.password || !isAdminPassword(body.password)) {
    return NextResponse.json({ error: "Senha invalida." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, createAdminSession(), adminCookieOptions());
  return response;
}
