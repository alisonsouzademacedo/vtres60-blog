import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin, invalidPayload } from "@/lib/admin-api";
import { operationsRepository } from "@/services/operations";
import type { MediaType } from "@/types/operations";

const accepted: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico" };
const mediaTypes:MediaType[]=["logos","news","articles","events","segments","open-graph","general"];
function hasValidSignature(type:string,bytes:Uint8Array){if(type==="image/png")return bytes.length>8&&bytes.slice(0,8).every((value,index)=>value===[137,80,78,71,13,10,26,10][index]);if(type==="image/jpeg")return bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;if(type==="image/webp")return bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";if(type==="image/x-icon"||type==="image/vnd.microsoft.icon")return bytes.length>4&&bytes[0]===0&&bytes[1]===0&&bytes[2]===1&&bytes[3]===0;return false}

export async function POST(request: Request) {
  const denied = await requireAdmin(); if (denied) return denied;
  const form = await request.formData();
  const file = form.get("file");
  const requestedType=String(form.get("type")??"general") as MediaType;
  const altText=String(form.get("altText")??"");
  if (!(file instanceof File)) return invalidPayload("Selecione uma imagem.");
  if(!mediaTypes.includes(requestedType))return invalidPayload("Tipo de mídia inválido.");
  const extension = accepted[file.type];
  if (!extension) return invalidPayload("Formato não suportado. Use PNG, JPG, WebP ou ICO.");
  if (file.size > 5 * 1024 * 1024) return invalidPayload("A imagem deve ter no máximo 5 MB.");
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(!hasValidSignature(file.type,bytes))return invalidPayload("O conteúdo do arquivo não corresponde a uma imagem válida.");
  const directory = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(directory, { recursive: true });
  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
  await fs.writeFile(path.join(directory, filename), bytes);
  const asset=await operationsRepository.createMedia({filename,url:`/uploads/${filename}`,altText,type:requestedType,mimeType:file.type,size:file.size});
  await operationsRepository.log("upload","mídia",`Imagem “${filename}” enviada para a biblioteca.`);
  return NextResponse.json(asset, { status: 201 });
}
