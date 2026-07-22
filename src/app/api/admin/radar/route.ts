import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { apiError, required } from "@/lib/editorial-api";
import { buildEvidenceContext, deriveSourceUrls } from "@/lib/radar/evidence-context";
import { validateRadarSignalPublication } from "@/lib/radar/validate-signal";
import { operationsRepository } from "@/services/operations";
import type { RadarSignal } from "@/types/operations";

export async function GET() {
  const denied = await requireAdmin();
  return denied ?? NextResponse.json(await operationsRepository.listRadarSignals());
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = (await request.json()) as Omit<RadarSignal, "id" | "createdAt" | "updatedAt" | "sourceUrls">;
    if (!required(body, ["title", "summary"])) return apiError(new Error("Título e resumo são obrigatórios."));
    const context = await buildEvidenceContext();
    const sourceUrls = deriveSourceUrls(body.evidencePostIds ?? [], context);
    const input = { ...body, sourceUrls } as Omit<RadarSignal, "id" | "createdAt" | "updatedAt">;
    const publishErrors = validateRadarSignalPublication(input, undefined, context);
    if (publishErrors.length) return apiError(new Error(publishErrors.map((e) => e.message).join(" ")), 422);
    const item = await operationsRepository.createRadarSignal(input);
    await operationsRepository.log("criação", "radar", `Sinal “${item.title}” criado.`);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
