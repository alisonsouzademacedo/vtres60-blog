import { NextResponse } from "next/server";import { requireAdmin } from "@/lib/admin-api";import { operationsRepository } from "@/services/operations";
export async function GET(){const denied=await requireAdmin();return denied??NextResponse.json(await operationsRepository.listLogs())}
