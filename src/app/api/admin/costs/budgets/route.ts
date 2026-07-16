import { NextResponse } from "next/server";
import { requireAdmin, invalidPayload } from "@/lib/admin-api";
import { createBudget, listActiveBudgets, type BudgetInput } from "@/lib/agent/costs/cost-settings-repository";
import { operationsRepository } from "@/services/operations";

// Fase 7 (Secao 15) — orcamento/credito inicial manual, usado para
// calcular "Saldo estimado" (nunca "Saldo oficial") por provider.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(await listActiveBudgets());
}

function isValidInput(value: unknown): value is BudgetInput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.provider === "string" &&
    typeof candidate.initialValue === "number" &&
    Number.isFinite(candidate.initialValue) &&
    typeof candidate.initialDate === "string"
  );
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!isValidInput(body)) return invalidPayload("Informe provider, initialValue (número) e initialDate.");

  const saved = await createBudget(body);
  await operationsRepository.log("edição", "custos", `Orçamento estimado cadastrado para ${saved.provider}: ${saved.currency} ${saved.initialValue} desde ${saved.initialDate}.`);
  return NextResponse.json(saved);
}
