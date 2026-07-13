import { NextResponse } from "next/server";
import { requireAdmin, invalidPayload } from "@/lib/admin-api";
import { configRepository } from "@/services/config";
import type { SeoSettings } from "@/types/admin";
import { operationsRepository } from "@/services/operations";

export async function GET() { const denied = await requireAdmin(); return denied ?? NextResponse.json(await configRepository.getSeo()); }
export async function PATCH(request: Request) {
  const denied = await requireAdmin(); if (denied) return denied;
  const patch = await request.json().catch(() => null) as Partial<SeoSettings> | null;
  if (!patch || typeof patch !== "object") return invalidPayload();
  const updated=await configRepository.updateSeo(patch);await operationsRepository.log("edição","SEO","Configurações globais de SEO atualizadas.");return NextResponse.json(updated);
}
