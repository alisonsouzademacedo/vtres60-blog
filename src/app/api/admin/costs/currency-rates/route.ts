import { NextResponse } from "next/server";
import { requireAdmin, invalidPayload } from "@/lib/admin-api";
import { createCurrencyRate, latestCurrencyRate, listCurrencyRates, type CurrencyRateInput } from "@/lib/agent/costs/cost-settings-repository";
import { operationsRepository } from "@/services/operations";

// Fase 7 (Secao 16) — taxa de cambio MANUAL para a conversao BRL exibida
// no painel de custos. Sem chamada a nenhum provider de cambio externo.
// Sem "from" na query: retorna a lista completa (usada pela UI admin).
// Com "from": retorna so a taxa mais recente daquele par (uso pontual).
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  if (!from) return NextResponse.json(await listCurrencyRates());
  const to = searchParams.get("to") ?? "BRL";
  const rate = await latestCurrencyRate(from, to);
  return NextResponse.json(rate ?? null);
}

function isValidInput(value: unknown): value is CurrencyRateInput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.currencyFrom === "string" &&
    typeof candidate.rate === "number" &&
    Number.isFinite(candidate.rate) &&
    candidate.rate > 0 &&
    typeof candidate.rateDate === "string"
  );
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!isValidInput(body)) return invalidPayload("Informe currencyFrom, rate (número positivo) e rateDate.");

  const saved = await createCurrencyRate(body);
  await operationsRepository.log("edição", "custos", `Taxa de câmbio cadastrada: 1 ${saved.currencyFrom} = ${saved.rate} ${saved.currencyTo} (${saved.rateDate}).`);
  return NextResponse.json(saved);
}
