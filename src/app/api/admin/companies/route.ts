import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { apiError, required } from "@/lib/editorial-api";
import { operationsRepository } from "@/services/operations";
import type { ManagedCompany } from "@/types/operations";

export async function GET() {
  const denied = await requireAdmin();
  return denied ?? NextResponse.json(await operationsRepository.listCompanies());
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = (await request.json()) as Omit<ManagedCompany, "id" | "createdAt" | "updatedAt">;
    if (!required(body, ["name", "slug", "description", "sector", "website"])) {
      return apiError(new Error("Nome, slug, descrição, setor e site oficial são obrigatórios."));
    }
    const item = await operationsRepository.createCompany(body);
    await operationsRepository.log("criação", "empresas", `Empresa "${item.name}" criada.`);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
