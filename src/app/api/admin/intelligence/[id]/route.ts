import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { apiError } from "@/lib/editorial-api";
import { buildEvidenceContext, deriveSourceUrls } from "@/lib/radar/evidence-context";
import { validateIntelligencePublication } from "@/lib/radar/validate-intelligence";
import { operationsRepository } from "@/services/operations";
import type { IntelligenceItem } from "@/types/operations";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const item = await operationsRepository.getIntelligenceItem(id);
  return item ? NextResponse.json(item) : apiError(new Error("Item não encontrado."), 404);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const patch = (await request.json()) as Partial<IntelligenceItem>;
    const current = await operationsRepository.getIntelligenceItem(id);
    if (!current) return apiError(new Error("Item não encontrado."), 404);
    const [context, signals] = await Promise.all([buildEvidenceContext(), operationsRepository.listRadarSignals()]);
    const realSignalIds = new Set(signals.map((s) => s.id));
    const mergedEvidence = patch.evidencePostIds ?? current.evidencePostIds;
    const sourceUrls = deriveSourceUrls(mergedEvidence, context);
    const merged = { ...current, ...patch, sourceUrls } as IntelligenceItem;
    const publishErrors = validateIntelligencePublication(merged, current, context, realSignalIds);
    if (publishErrors.length) return apiError(new Error(publishErrors.map((e) => e.message).join(" ")), 422);
    const item = await operationsRepository.updateIntelligenceItem(id, { ...patch, sourceUrls });
    if (!item) return apiError(new Error("Item não encontrado."), 404);
    await operationsRepository.log("edição", "inteligencia", `Item “${item.title}” atualizado.`);
    return NextResponse.json(item);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const item = await operationsRepository.getIntelligenceItem(id);
  if (!item) return apiError(new Error("Item não encontrado."), 404);
  await operationsRepository.deleteIntelligenceItem(id);
  await operationsRepository.log("exclusão", "inteligencia", `Item “${item.title}” excluído.`);
  return NextResponse.json({ ok: true });
}
