import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { apiError } from "@/lib/editorial-api";
import { operationsRepository } from "@/services/operations";
import type { ManagedCompany } from "@/types/operations";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const item = await operationsRepository.getCompany(id);
  return item ? NextResponse.json(item) : apiError(new Error("Empresa não encontrada."), 404);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const patch = (await request.json()) as Partial<ManagedCompany>;
    const item = await operationsRepository.updateCompany(id, patch);
    if (!item) return apiError(new Error("Empresa não encontrada."), 404);
    await operationsRepository.log("edição", "empresas", `Empresa "${item.name}" atualizada.`);
    return NextResponse.json(item);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const item = await operationsRepository.getCompany(id);
  if (!item) return apiError(new Error("Empresa não encontrada."), 404);
  await operationsRepository.deleteCompany(id);
  await operationsRepository.log("exclusão", "empresas", `Empresa "${item.name}" excluída.`);
  return NextResponse.json({ ok: true });
}
