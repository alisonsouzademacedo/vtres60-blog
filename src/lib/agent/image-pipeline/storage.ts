import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { recordProviderUsage } from "../costs/usage-repository";
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
//
// Fase 7 (Secao 12) — instrumenta sucesso/falha do upload, tamanho do
// arquivo e latency. NAO calcula um "custo por upload" — Supabase Storage
// e cobrado por plano/armazenamento total, nao por requisicao individual
// nesta conta; cost_status="unavailable" sempre (Secao 12/49: o painel
// separa custo calculavel por requisicao de custo de infraestrutura nao
// atribuivel diretamente — este cai na segunda categoria).
export async function uploadToEditorialStorage(
  storagePath: string,
  buffer: Buffer,
  runId?: string,
): Promise<StorageUploadResult | StorageUploadFailure> {
  const startedAt = new Date().toISOString();
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: `image/${OUTPUT_FORMAT}`,
    upsert: false,
  });
  const finishedAt = new Date().toISOString();
  const baseUsage = {
    runId,
    provider: "supabase" as const,
    operation: "storage_upload" as const,
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    costStatus: "unavailable" as const,
    usage: { bytes: buffer.length, storage_path: storagePath },
  };

  if (error) {
    await recordProviderUsage({ ...baseUsage, success: false, errorCode: "StorageUploadFailed", errorMessage: error.message.slice(0, 500) }).catch(
      () => undefined,
    );
    return { ok: false };
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
  if (!data?.publicUrl) {
    await recordProviderUsage({ ...baseUsage, success: false, errorCode: "PublicUrlMissing", errorMessage: "getPublicUrl nao retornou publicUrl." }).catch(
      () => undefined,
    );
    return { ok: false };
  }

  await recordProviderUsage({ ...baseUsage, success: true }).catch(() => undefined);
  return { ok: true, publicUrl: data.publicUrl };
}
