import { NextResponse } from "next/server";import { requireAdmin } from "@/lib/admin-api";import { apiError,required } from "@/lib/editorial-api";import { validateEventPublication } from "@/lib/agenda/event-publish-rules";import { operationsRepository } from "@/services/operations";import type { ManagedEvent } from "@/types/operations";
export async function GET(){const denied=await requireAdmin();return denied??NextResponse.json(await operationsRepository.listEvents())}
export async function POST(request:Request){const denied=await requireAdmin();if(denied)return denied;try{const body=await request.json() as Omit<ManagedEvent,"id"|"createdAt"|"updatedAt">;if(!required(body,["name","slug","description","startDate","endDate"]))return apiError(new Error("Nome, slug, descrição e datas são obrigatórios."));
  // Fechamento Fase 8C (secao 8): servidor nunca confia no client — criar
  // um evento ja como "published" exige ter passado por "verified" antes,
  // o que e impossivel na criacao (nao ha status anterior).
  const publishErrors=validateEventPublication(body,undefined);if(publishErrors.length)return apiError(new Error(publishErrors.map(e=>e.message).join(" ")),422);
  const item=await operationsRepository.createEvent(body);await operationsRepository.log("criação","eventos",`Evento “${item.name}” criado.`);return NextResponse.json(item,{status:201})}catch(error){return apiError(error)}}
