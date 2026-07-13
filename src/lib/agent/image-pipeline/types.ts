// Fase 4 — tipos e constantes compartilhados da pipeline visual do agente.

// Master editorial derivado dos usos REAIS de featured_image no frontend
// (ver relatorio da Fase 4): o container mais largo encontrado e o hero da
// pagina interna da noticia, com aspect-ratio:2.15 (article.module.css). Os
// demais usos (article-card 16:10=1.6, side card mobile 1.4, compact/hero
// mobile 1.25) sao todos mais estreitos — logo, cabem via object-fit:cover
// (corte nas laterais) a partir de uma master nessa largura, sem upscale.
export const MASTER_WIDTH = 2150;
export const MASTER_HEIGHT = 1000;
export const MASTER_RATIO = MASTER_WIDTH / MASTER_HEIGHT; // 2.15

// Proporcao mais estreita realmente usada no frontend (compact card e hero
// mobile, ambos aspect-ratio:1.25) — usada para calcular a "safe area"
// horizontal da assinatura VTRES60 (ver signature.ts): qualquer coisa fora
// da faixa central de MASTER_HEIGHT * NARROWEST_RATIO de largura e cortada
// quando o browser faz object-fit:cover num container mais estreito que a
// master.
export const NARROWEST_REAL_RATIO = 1.25;

// Tolerancia de upscale: sharp faz "cover" ampliando a imagem se ela for
// menor que o alvo. Um fator de escala levemente acima de 1 (ate 15%) e
// aceitavel (raramente perceptivel); acima disso e upscale significativo e
// a candidata e rejeitada (resolution_too_low) em vez de degradar
// qualidade.
export const MAX_ACCEPTABLE_UPSCALE_FACTOR = 1.15;

export const DOWNLOAD_TIMEOUT_MS = 10_000;
export const MAX_DOWNLOAD_BYTES = 12_000_000; // 12 MB

// Formato final: WebP. Suporte universal em browsers modernos (todo
// browser relevante desde ~2020), compressao melhor que JPEG na mesma
// qualidade percebida, sem necessidade de transparencia (fotografia
// editorial). next.config.ts usa loader:"custom" (image-loader.ts,
// passthrough) — o Next nao reprocessa a imagem, entao o formato final
// entregue pela pipeline e o formato final servido ao browser.
export const OUTPUT_FORMAT = "webp" as const;
export const OUTPUT_QUALITY = 82;

// Janela de deduplicacao de IMAGEM (diferente da janela de 7 dias de
// EVENTOS/noticias da Fase 3 — ver semantic-dedupe.ts). Imagem e um
// artefato reaproveitavel por mais tempo sem indicar a mesma pauta.
export const IMAGE_DEDUPE_WINDOW_DAYS = 30;

export type ImageOrigin = "source_og" | "generated_replicate" | "pexels";

export type ImageTierFailureReason =
  | "missing_source_image"
  | "download_failed"
  | "download_timeout"
  | "download_too_large"
  | "invalid_http_status"
  | "invalid_content_type"
  | "empty_buffer"
  | "decode_failed"
  | "unsupported_format"
  | "resolution_too_low"
  | "aspect_ratio_unprocessable"
  | "relevance_unverified"
  | "duplicate_image"
  | "generation_failed"
  | "replicate_invalid_output"
  | "no_pexels_candidate"
  | "storage_upload_failed";

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  hash: string;
  signed: boolean;
}

export interface ImageProcessingSuccess {
  status: "success";
  finalImageUrl: string;
  sourceUrl: string | undefined;
  credit: string | undefined;
  origin: ImageOrigin;
  hash: string;
  width: number;
  height: number;
}

export interface ImageProcessingFailure {
  status: "failed";
  reason: ImageTierFailureReason | "image_pipeline_failed";
}

export type ImageProcessingResult = ImageProcessingSuccess | ImageProcessingFailure;
