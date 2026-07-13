import { NextResponse } from "next/server";
import { requireAdmin, invalidPayload } from "@/lib/admin-api";
import { configRepository } from "@/services/config";
import type { BrandingSettings } from "@/types/admin";
import { operationsRepository } from "@/services/operations";

export async function GET() { const denied = await requireAdmin(); return denied ?? NextResponse.json(await configRepository.getBranding()); }
export async function PATCH(request: Request) {
  const denied = await requireAdmin(); if (denied) return denied;
  const patch = await request.json().catch(() => null) as Partial<BrandingSettings> | null;
  if (!patch || typeof patch !== "object") return invalidPayload();
  const updated=await configRepository.updateBranding(patch);await operationsRepository.log("edição","identidade visual","Identidade visual e arquivos de marca atualizados.");return NextResponse.json(updated);
}
