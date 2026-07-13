import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  MASTER_HEIGHT,
  MASTER_WIDTH,
  MAX_ACCEPTABLE_UPSCALE_FACTOR,
  NARROWEST_REAL_RATIO,
  OUTPUT_FORMAT,
  OUTPUT_QUALITY,
  type ImageTierFailureReason,
  type ProcessedImage,
} from "./types";

export interface QaResult {
  ok: true;
  width: number;
  height: number;
}

export interface QaFailure {
  ok: false;
  reason: ImageTierFailureReason;
}

// QA tecnico: decodifica e valida resolucao ANTES de qualquer
// processamento pesado. Resolucao minima e derivada do master (nao um
// numero arbitrario): se a imagem fonte precisar ser ampliada mais que
// MAX_ACCEPTABLE_UPSCALE_FACTOR para cobrir MASTER_WIDTH x MASTER_HEIGHT
// via "cover", ela e rejeitada em vez de gerar upscale agressivo.
export async function qaTechnicalCheck(buffer: Buffer): Promise<QaResult | QaFailure> {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    return { ok: false, reason: "decode_failed" };
  }

  const { width, height, format } = metadata;
  if (!format) {
    return { ok: false, reason: "unsupported_format" };
  }
  if (!width || !height || width <= 0 || height <= 0) {
    return { ok: false, reason: "aspect_ratio_unprocessable" };
  }

  const scaleToCover = Math.max(MASTER_WIDTH / width, MASTER_HEIGHT / height);
  if (scaleToCover > MAX_ACCEPTABLE_UPSCALE_FACTOR) {
    return { ok: false, reason: "resolution_too_low" };
  }

  return { ok: true, width, height };
}

// Posicao segura da assinatura VTRES60: o master (MASTER_WIDTH x
// MASTER_HEIGHT, razao 2.15) e mais largo que o uso mais estreito real do
// frontend (compact card / hero mobile, aspect-ratio:1.25 — ver
// article-card.module.css e article.module.css). Quando o browser aplica
// object-fit:cover num container mais estreito que a master, ele corta as
// LATERAIS simetricamente a partir do centro, preservando sempre a faixa
// central de largura (MASTER_HEIGHT * NARROWEST_REAL_RATIO). Um selo no
// canto absoluto da master seria cortado em qualquer card/hero mobile —
// por isso o selo e posicionado dentro dessa faixa central segura, perto
// da borda direita DELA (nao da master), preservando a leitura de "canto"
// no hero desktop (onde a master aparece inteira) sem desaparecer nos
// recortes mais estreitos.
const SAFE_BAND_WIDTH = MASTER_HEIGHT * NARROWEST_REAL_RATIO;
const SAFE_BAND_LEFT = (MASTER_WIDTH - SAFE_BAND_WIDTH) / 2;
const SIGNATURE_SIZE = 56;
const SIGNATURE_MARGIN = 24;
const SIGNATURE_LEFT = Math.round(SAFE_BAND_LEFT + SAFE_BAND_WIDTH - SIGNATURE_MARGIN - SIGNATURE_SIZE);
const SIGNATURE_TOP = Math.round(MASTER_HEIGHT - SIGNATURE_MARGIN - SIGNATURE_SIZE);

const OFFICIAL_ICON_PATH = path.join(process.cwd(), "src/app/icon.svg");

function loadOfficialSignatureAsset(): Buffer | undefined {
  try {
    return readFileSync(OFFICIAL_ICON_PATH);
  } catch {
    return undefined;
  }
}

// Processamento tecnico completo: auto-orientacao -> crop/resize para a
// proporcao master (via "attention", que prioriza a regiao com mais
// detalhe/saliencia visual em vez de um corte central ingenuo — heuristica
// algoritmica deterministica do sharp, nao IA) -> formato web final ->
// assinatura (so quando permitida e o asset oficial existir) -> hash
// SHA-256 dos bytes finais.
//
// Nenhum ajuste estetico arbitrario (sem filtro, LUT, saturacao/contraste
// fixos, sharpening agressivo) — so normalizacao tecnica de entrega.
export async function processAndSignImage(buffer: Buffer, applySignature: boolean): Promise<ProcessedImage> {
  let pipeline = sharp(buffer).rotate(); // auto-orient via EXIF, depois descarta o EXIF
  pipeline = pipeline.resize(MASTER_WIDTH, MASTER_HEIGHT, { fit: "cover", position: sharp.strategy.attention });

  let signed = false;
  const signatureAsset = applySignature ? loadOfficialSignatureAsset() : undefined;

  if (signatureAsset) {
    const badge = await sharp(signatureAsset).resize(SIGNATURE_SIZE, SIGNATURE_SIZE).png().toBuffer();
    const base = await pipeline.png().toBuffer();
    const composed = await sharp(base)
      .composite([{ input: badge, left: SIGNATURE_LEFT, top: SIGNATURE_TOP }])
      .toBuffer();
    pipeline = sharp(composed);
    signed = true;
  }

  // withMetadata() nao e chamado — sharp descarta EXIF/metadata por padrao
  // na saida, cumprindo "remocao de metadata desnecessaria".
  const finalBuffer = await pipeline.webp({ quality: OUTPUT_QUALITY }).toBuffer();
  const finalMeta = await sharp(finalBuffer).metadata();

  const hash = createHash("sha256").update(finalBuffer).digest("hex");

  return {
    buffer: finalBuffer,
    width: finalMeta.width ?? MASTER_WIDTH,
    height: finalMeta.height ?? MASTER_HEIGHT,
    hash,
    signed,
  };
}

export { OUTPUT_FORMAT };
