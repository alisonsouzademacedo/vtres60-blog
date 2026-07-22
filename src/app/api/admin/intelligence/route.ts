import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { apiError, required } from "@/lib/editorial-api";
import { buildEvidenceContext, deriveSourceUrls } from "@/lib/radar/evidence-context";
import { validateIntelligencePublication } from "@/lib/radar/validate-intelligence";
import { operationsRepository } from "@/services/operations";
import type { IntelligenceItem } from "@/types/operations";

export async function GET() {
  const denied = await requireAdmin();
  return denied ?? NextResponse.json(await operationsRepository.listIntelligenceItems());
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = (await request.json()) as Omit<IntelligenceItem, "id" | "createdAt" | "updatedAt" | "sourceUrls">;
    if (!required(body, ["title", "analysis", "radarSignalId"])) return apiError(new Error("Título, análise e sinal de origem são obrigatórios."));
    const [context, signals] = await Promise.all([buildEvidenceContext(), operationsRepository.listRadarSignals()]);
    const realSignalIds = new Set(signals.map((s) => s.id));
    const sourceUrls = deriveSourceUrls(body.evidencePostIds ?? [], context);
    const input = { ...body, sourceUrls } as Omit<IntelligenceItem, "id" | "createdAt" | "updatedAt">;
    const publishErrors = validateIntelligencePublication(input, undefined, context, realSignalIds);
    if (publishErrors.length) return apiError(new Error(publishErrors.map((e) => e.message).join(" ")), 422);
    const item = await operationsRepository.createIntelligenceItem(input);
    await operationsRepository.log("criação", "inteligencia", `Item “${item.title}” criado.`);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
