import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { apiError, required } from "@/lib/editorial-api";
import { editorialRepository } from "@/services/editorial";
import type { ManagedPost } from "@/types/editorial";
export async function GET(){const denied=await requireAdmin();return denied??NextResponse.json(await editorialRepository.listPosts())}
export async function POST(request:Request){const denied=await requireAdmin();if(denied)return denied;try{const body=await request.json() as Omit<ManagedPost,"id"|"createdAt"|"updatedAt">;if(!required(body,["title","slug","excerpt","content"]))return apiError(new Error("Título, slug, resumo e conteúdo são obrigatórios."));const item=await editorialRepository.createPost(body);const{operationsRepository}=await import("@/services/operations");await operationsRepository.log("criação","notícias",`Notícia “${item.title}” criada.`);return NextResponse.json(item,{status:201})}catch(error){return apiError(error)}}
