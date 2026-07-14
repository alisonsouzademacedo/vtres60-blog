import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { getCachedProviderHealth } from "@/lib/agent/health/provider-health";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

// Fase 6 (Secao 26/39) — cache real fica em getCachedProviderHealth()
// (compartilhado com admin/agente/page.tsx, que le direto sem round-trip
// HTTP). Rate limit aqui protege contra abuso do endpoint mesmo dentro da
// janela de cache (ex: polling client-side de varias abas do admin).
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const ip = getClientIp(request);
  const limited = rateLimit(`admin-health:${ip}`, 10, 60_000);
  if (limited.limited) {
    return NextResponse.json({ error: "Muitas verificações recentes. Aguarde um minuto." }, { status: 429 });
  }

  const { providers, cached } = await getCachedProviderHealth();
  return NextResponse.json({ providers, cached });
}
