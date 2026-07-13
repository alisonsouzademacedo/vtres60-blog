import { NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { operationsRepository } from "@/services/operations";
import { leadIntegrations } from "@/services/integrations/lead-integration";
import type { Lead } from "@/types/operations";

type LeadPayload = Partial<Lead> & { consent?: boolean; website?: string };

const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limited = rateLimit(`lead:${ip}`, 5, 10 * 60 * 1000);
  if (limited.limited) {
    return NextResponse.json({ error: "Muitas tentativas. Tente novamente em alguns minutos." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as LeadPayload | null;
  if (text(body?.website, 200)) {
    return NextResponse.json({ ok: true, message: "Cadastro recebido com sucesso." }, { status: 202 });
  }
  if (!body?.consent) {
    return NextResponse.json({ error: "Confirme o consentimento para receber a newsletter." }, { status: 400 });
  }

  const normalizedEmail = text(body?.email, 254).toLowerCase();
  if (!email.test(normalizedEmail)) {
    return NextResponse.json({ error: "Informe um e-mail valido." }, { status: 400 });
  }

  const lead = await operationsRepository.createLead({
    name: text(body?.name, 120),
    email: normalizedEmail,
    company: text(body?.company, 160),
    role: text(body?.role, 120),
    phone: text(body?.phone, 40),
    source: text(body?.source, 80) || "newsletter",
    interest: text(body?.interest, 160) || "Briefing Industrial",
    originPage: text(body?.originPage, 300) || "/",
  });
  await Promise.all(leadIntegrations.filter((item) => item.enabled).map((item) => item.send(lead)));
  await operationsRepository.log("captacao", "leads", `Novo lead captado: ${lead.email}.`);
  return NextResponse.json({ ok: true, message: "Cadastro recebido com sucesso." }, { status: 201 });
}
