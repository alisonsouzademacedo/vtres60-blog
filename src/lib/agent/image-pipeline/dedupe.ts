import { supabaseAdmin } from "@/lib/supabase";
import { normalizeSourceUrl } from "../text-guards";
import { IMAGE_DEDUPE_WINDOW_DAYS } from "./types";

// Deduplicacao de IMAGEM: janela de 30 dias (diferente da janela de 7 dias
// de EVENTOS/noticias da Fase 3 — semantic-dedupe.ts). Uma imagem final e
// um artefato reaproveitavel por mais tempo do que a noticia em si continua
// sendo a "mesma pauta". Comparacao e EXATA (SHA-256 dos bytes finais e/ou
// image_source_url normalizada) — nao ha deteccao de similaridade visual/
// perceptual (pHash) nesta fase; o projeto nao possui biblioteca para isso.
export async function isImageDuplicate(hash: string, sourceUrl: string | undefined): Promise<boolean> {
  const sinceIso = new Date(Date.now() - IMAGE_DEDUPE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const byHash = await supabaseAdmin
    .from("posts")
    .select("id")
    .eq("image_hash", hash)
    .gte("created_at", sinceIso)
    .limit(1);
  if (byHash.error) throw new Error(byHash.error.message);
  if ((byHash.data?.length ?? 0) > 0) return true;

  if (sourceUrl) {
    const normalized = normalizeSourceUrl(sourceUrl);
    const byUrl = await supabaseAdmin
      .from("posts")
      .select("id, image_source_url")
      .gte("created_at", sinceIso)
      .not("image_source_url", "is", null);
    if (byUrl.error) throw new Error(byUrl.error.message);
    const collision = (byUrl.data ?? []).some(
      (row) => typeof row.image_source_url === "string" && normalizeSourceUrl(row.image_source_url) === normalized,
    );
    if (collision) return true;
  }

  return false;
}
