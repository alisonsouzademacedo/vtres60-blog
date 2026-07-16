import { NextResponse } from "next/server";
import { requireAdmin, invalidPayload } from "@/lib/admin-api";
import { listManualPrices, upsertManualPrice, type ManualPriceInput } from "@/lib/agent/costs/cost-settings-repository";
import { operationsRepository } from "@/services/operations";

// Fase 7 (Secao 14) — CRUD de precos MANUAIS (provider_cost_settings).
// Nunca confundido com pricing.ts (OFFICIAL_VERIFIED, versionado em
// codigo) — ver resolve-price.ts para a regra de precedencia entre os
// quatro estados.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(await listManualPrices());
}

function isValidInput(value: unknown): value is ManualPriceInput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.provider === "string" && typeof candidate.model === "string" && typeof candidate.unit === "string";
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!isValidInput(body)) return invalidPayload("Informe provider, model e unit.");

  const saved = await upsertManualPrice(body);
  await operationsRepository.log("edição", "custos", `Preço manual atualizado: ${saved.provider}/${saved.model}/${saved.unit}.`);
  return NextResponse.json(saved);
}
