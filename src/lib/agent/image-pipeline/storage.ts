import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { OUTPUT_FORMAT } from "./types";

const BUCKET = "editorial-images";

// Path deterministico e sem colisao: <identificador-estavel-da-pauta>/<hash
// parcial>-<uuid curto>.webp. Usa queueItemId quando disponivel (Fase 3 —
// id estavel da pauta em agent_queue) ou o hostname+timestamp como
// fallback para execucoes sem fila (trigger manual sem queueItemId). O
// hash da IMAGEM entra no nome do arquivo (nao so no path) para que duas
// noticias distintas, mesmo com o mesmo identificador de pauta reprocessado,
// nunca sobrescrevam silenciosamente o arquivo uma da outra — e o sufixo
// randomUUID curto cobre o caso (raro) de mesma pauta + mesmo hash de
// imagem reprocessados no mesmo milissegundo.
export function buildStoragePath(stableId: string, imageHash: string): string {
  const safeId = stableId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "sem-id";
  const shortHash = imageHash.slice(0, 16);
  const shortUuid = randomUUID().slice(0, 8);
  return `posts/${safeId}/${shortHash}-${shortUuid}.${OUTPUT_FORMAT}`;
}

export interface StorageUploadResult {
  ok: true;
  publicUrl: string;
}

export interface StorageUploadFailure {
  ok: false;
}

// Upload exclusivamente server-side via supabaseAdmin (service_role) — a
// mesma credencial admin ja usada por editorialRepository/queueRepository/
// operationsRepository. Nunca client-side, nunca com a anon key.
export async function uploadToEditorialStorage(storagePath: string, buffer: Buffer): Promise<StorageUploadResult | StorageUploadFailure> {
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: `image/${OUTPUT_FORMAT}`,
    upsert: false,
  });
  if (error) return { ok: false };

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
  if (!data?.publicUrl) return { ok: false };

  return { ok: true, publicUrl: data.publicUrl };
}
