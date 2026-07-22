import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { apiError } from "@/lib/editorial-api";
import { buildEvidenceContext, deriveSourceUrls } from "@/lib/radar/evidence-context";
import { validateRadarSignalPublication } from "@/lib/radar/validate-signal";
import { operationsRepository } from "@/services/operations";
import type { RadarSignal } from "@/types/operations";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const item = await operationsRepository.getRadarSignal(id);
  return item ? NextResponse.json(item) : apiError(new Error("Sinal não encontrado."), 404);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const patch = (await request.json()) as Partial<RadarSignal>;
    const current = await operationsRepository.getRadarSignal(id);
    if (!current) return apiError(new Error("Sinal não encontrado."), 404);
    const context = await buildEvidenceContext();
    const mergedEvidence = patch.evidencePostIds ?? current.evidencePostIds;
    const sourceUrls = deriveSourceUrls(mergedEvidence, context);
    const merged = { ...current, ...patch, sourceUrls } as RadarSignal;
    const publishErrors = validateRadarSignalPublication(merged, current, context);
    if (publishErrors.length) return apiError(new Error(publishErrors.map((e) => e.message).join(" ")), 422);
    const item = await operationsRepository.updateRadarSignal(id, { ...patch, sourceUrls });
    if (!item) return apiError(new Error("Sinal não encontrado."), 404);
    await operationsRepository.log("edição", "radar", `Sinal “${item.title}” atualizado.`);
    return NextResponse.json(item);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const item = await operationsRepository.getRadarSignal(id);
  if (!item) return apiError(new Error("Sinal não encontrado."), 404);
  await operationsRepository.deleteRadarSignal(id);
  await operationsRepository.log("exclusão", "radar", `Sinal “${item.title}” excluído.`);
  return NextResponse.json({ ok: true });
}
