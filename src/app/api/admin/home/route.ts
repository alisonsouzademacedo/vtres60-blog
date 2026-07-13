import { NextResponse } from "next/server";
import { requireAdmin, invalidPayload } from "@/lib/admin-api";
import { configRepository } from "@/services/config";
import type { HomeSettings } from "@/types/admin";

export async function GET() { const denied = await requireAdmin(); return denied ?? NextResponse.json(await configRepository.getHome()); }
export async function PATCH(request: Request) {
  const denied = await requireAdmin(); if (denied) return denied;
  const patch = await request.json().catch(() => null) as Partial<HomeSettings> | null;
  if (!patch || typeof patch !== "object") return invalidPayload();
  return NextResponse.json(await configRepository.updateHome(patch));
}
