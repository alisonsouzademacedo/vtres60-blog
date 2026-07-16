import { operationsRepository } from "@/services/operations";
import type { AgentState, AgentStateUpdate } from "../state";
import { loadValidCategories } from "../taxonomies";
import { downloadImage } from "../image-pipeline/download";
import { isImageDuplicate } from "../image-pipeline/dedupe";
import { qaTechnicalCheck, processAndSignImage } from "../image-pipeline/processing";
import { fetchPexelsCandidates, generateWithReplicate } from "../image-pipeline/providers";
import { assessSourceOgRelevance } from "../image-pipeline/relevance";
import { buildReplicatePrompt } from "../image-pipeline/replicate-prompt";
import { buildStoragePath, uploadToEditorialStorage } from "../image-pipeline/storage";
import type { ImageOrigin, ImageProcessingResult, ImageTierFailureReason } from "../image-pipeline/types";

function isValidUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// Limpa o dominio retornado pelo Drafter (LLM) antes de montar a URL do
// favicon — preservado sem alteracao da Fase 3 (ver historico em
// image-processor.ts anterior). companyLogoUrl e um conceito
// COMPLETAMENTE separado da imagem principal (featured_image/imageResult)
// — nunca e composto dentro dela, so guardado em seo.companyLogoUrl pelo
// Publisher.
function normalizeDomain(domain: string): string | undefined {
  const clean = domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  return clean && clean !== "null" ? clean : undefined;
}

// Metadata segura para log: nunca inclui API key, buffer/base64, ou corpo
// da noticia — so identificadores, dimensoes e reasons.
async function logTier(
  action: "image_tier_start" | "image_tier_success" | "image_tier_failure",
  tier: ImageOrigin | "pipeline",
  detail: Record<string, unknown>,
): Promise<void> {
  await operationsRepository.log(action, "agente", JSON.stringify({ tier, ...detail }));
}

function stableIdFor(state: AgentState): string {
  return state.queueItemId ?? state.sourceUrl ?? state.finalPost?.titulo ?? "sem-id";
}

interface FinalizeParams {
  buffer: Buffer;
  origin: ImageOrigin;
  applySignature: boolean;
  sourceUrl: string | undefined;
  credit: string | undefined;
  stableId: string;
  runId: string | undefined;
}

// Passo final comum aos 3 tiers, uma vez que ja se tem um buffer decodificavel
// aprovado no QA tecnico: processamento -> (assinatura quando permitida) ->
// hash -> dedupe (30 dias) -> upload Storage.
async function finalizeCandidate(params: FinalizeParams): Promise<ImageProcessingResult | undefined> {
  const processed = await processAndSignImage(params.buffer, params.applySignature);

  const duplicate = await isImageDuplicate(processed.hash, params.sourceUrl);
  if (duplicate) {
    await logTier("image_tier_failure", params.origin, { reason: "duplicate_image" satisfies ImageTierFailureReason });
    return undefined;
  }

  const storagePath = buildStoragePath(params.stableId, processed.hash);
  const uploaded = await uploadToEditorialStorage(storagePath, processed.buffer, params.runId);
  if (!uploaded.ok) {
    await logTier("image_tier_failure", params.origin, { reason: "storage_upload_failed" satisfies ImageTierFailureReason });
    return undefined;
  }

  await logTier("image_tier_success", params.origin, {
    width: processed.width,
    height: processed.height,
    hash: processed.hash,
    signed: processed.signed,
    bytes: processed.buffer.length,
  });

  return {
    status: "success",
    finalImageUrl: uploaded.publicUrl,
    sourceUrl: params.sourceUrl,
    credit: params.credit,
    origin: params.origin,
    hash: processed.hash,
    width: processed.width,
    height: processed.height,
  };
}

// Tier 1 — source_og: og:image extraida pelo ContentExtractor da propria
// pagina do artigo. Nunca aceita so por responder 200 image/* (ver
// download.ts + qaTechnicalCheck) — passa tambem por QA de relevancia
// (relevance.ts) antes do download.
async function trySourceOg(state: AgentState): Promise<ImageProcessingResult | undefined> {
  if (!isValidUrl(state.ogImage)) {
    await logTier("image_tier_failure", "source_og", { reason: "missing_source_image" satisfies ImageTierFailureReason });
    return undefined;
  }
  await logTier("image_tier_start", "source_og", { sourceUrl: state.ogImage });

  const relevance = assessSourceOgRelevance(state.ogImage, state.ogImageAlt);
  if (!relevance.relevant) {
    await logTier("image_tier_failure", "source_og", { reason: relevance.reason });
    return undefined;
  }

  const download = await downloadImage(state.ogImage);
  if (!download.ok) {
    await logTier("image_tier_failure", "source_og", { reason: download.reason });
    return undefined;
  }

  const qa = await qaTechnicalCheck(download.buffer);
  if (!qa.ok) {
    await logTier("image_tier_failure", "source_og", { reason: qa.reason });
    return undefined;
  }

  // Credito: nenhum sinal confiavel de fotografo esta disponivel no
  // ContentExtractor atual (so og:image:alt, que e descricao, nao credito
  // — "Fonte: G1" nao e "Foto: G1"). image_credit fica null/vazio aqui,
  // documentado honestamente (ver relatorio da Fase 4), em vez de inferir
  // pelo dominio da noticia.
  return finalizeCandidate({
    buffer: download.buffer,
    origin: "source_og",
    applySignature: false,
    sourceUrl: state.ogImage,
    credit: undefined,
    stableId: stableIdFor(state),
    runId: state.runId,
  });
}

// Tier 2 — generated_replicate: Flux-schnell preservado da Fase 3, prompt
// atualizado (replicate-prompt.ts) com contexto factual real e regras
// contra fabricacao de registro documental. Unico tier em que a assinatura
// VTRES60 e permitida.
async function tryReplicate(state: AgentState, categoryName: string | undefined): Promise<ImageProcessingResult | undefined> {
  await logTier("image_tier_start", "generated_replicate", {});

  const prompt = buildReplicatePrompt({
    titulo: state.finalPost?.titulo ?? "",
    excerpt: state.finalPost?.excerpt ?? "",
    impact: state.finalPost?.impact ?? "",
    imageKeyword: state.imageKeyword,
    categoryName,
  });

  const providerUrl = await generateWithReplicate(prompt, state.runId);
  if (!providerUrl) {
    await logTier("image_tier_failure", "generated_replicate", { reason: "generation_failed" satisfies ImageTierFailureReason });
    return undefined;
  }

  const download = await downloadImage(providerUrl);
  if (!download.ok) {
    const reason: ImageTierFailureReason = download.reason === "invalid_content_type" ? "replicate_invalid_output" : download.reason;
    await logTier("image_tier_failure", "generated_replicate", { reason });
    return undefined;
  }

  const qa = await qaTechnicalCheck(download.buffer);
  if (!qa.ok) {
    await logTier("image_tier_failure", "generated_replicate", { reason: qa.reason });
    return undefined;
  }

  return finalizeCandidate({
    buffer: download.buffer,
    origin: "generated_replicate",
    applySignature: true,
    sourceUrl: providerUrl,
    credit: undefined,
    stableId: stableIdFor(state),
    runId: state.runId,
  });
}

// Tier 3 — Pexels: pequeno conjunto de candidatas (ver providers.ts),
// tenta cada uma ate achar a primeira que passe QA + dedupe.
async function tryPexels(state: AgentState): Promise<ImageProcessingResult | undefined> {
  await logTier("image_tier_start", "pexels", {});

  const candidates = await fetchPexelsCandidates(state.imageKeyword, state.runId);
  if (!candidates.length) {
    await logTier("image_tier_failure", "pexels", { reason: "no_pexels_candidate" satisfies ImageTierFailureReason });
    return undefined;
  }

  for (const candidate of candidates) {
    const download = await downloadImage(candidate.url);
    if (!download.ok) continue;

    const qa = await qaTechnicalCheck(download.buffer);
    if (!qa.ok) continue;

    const credit = candidate.photographer
      ? `Foto: ${candidate.photographer}${candidate.photographerUrl ? ` (${candidate.photographerUrl})` : ""}`
      : undefined;

    const finalized = await finalizeCandidate({
      buffer: download.buffer,
      origin: "pexels",
      applySignature: false,
      sourceUrl: candidate.pageUrl ?? candidate.url,
      credit,
      stableId: stableIdFor(state),
      runId: state.runId,
    });
    if (finalized) return finalized;
  }

  await logTier("image_tier_failure", "pexels", { reason: "no_pexels_candidate" satisfies ImageTierFailureReason });
  return undefined;
}

/**
 * Fase 4 — cascata da imagem principal, agora com download real,
 * processamento tecnico controlado, deduplicacao exata e Storage proprio
 * (nunca mais hotlink direto nem via.placeholder.com):
 *
 * 1. source_og — foto real da materia, quando existe, relevante e valida.
 * 2. generated_replicate — ilustracao editorial via IA (Flux-schnell).
 * 3. pexels — banco de imagens stock.
 * 4. Nenhum tier aprovado -> image_pipeline_failed (workflow.ts impede o
 *    Publisher de rodar — ver routeAfterImageProcessing).
 *
 * companyLogoUrl (favicon da empresa, Google Favicons) continua resolvido
 * aqui em paralelo, sem relacao com qual tier a imagem principal seguiu —
 * mesma logica preservada da Fase 3.
 */
export async function imageProcessorNode(state: AgentState): Promise<AgentStateUpdate> {
  const categoryName = state.finalPost?.categoryId
    ? (await loadValidCategories()).find((category) => category.id === state.finalPost?.categoryId)?.name
    : undefined;

  const cleanDomain = state.companyDomain ? normalizeDomain(state.companyDomain) : undefined;
  const companyLogoUrl = cleanDomain ? `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=256` : undefined;

  const sourceOgResult = await trySourceOg(state);
  if (sourceOgResult) {
    return { imageResult: sourceOgResult, companyLogoUrl, currentStep: "Imagem definida (fonte original), salvando rascunho..." };
  }

  const replicateResult = await tryReplicate(state, categoryName);
  if (replicateResult) {
    return { imageResult: replicateResult, companyLogoUrl, currentStep: "Imagem definida (gerada), salvando rascunho..." };
  }

  const pexelsResult = await tryPexels(state);
  if (pexelsResult) {
    return { imageResult: pexelsResult, companyLogoUrl, currentStep: "Imagem definida (banco de imagens), salvando rascunho..." };
  }

  await logTier("image_tier_failure", "pipeline", { reason: "image_pipeline_failed" });
  return {
    imageResult: { status: "failed", reason: "image_pipeline_failed" },
    companyLogoUrl,
    currentStep: "Pipeline de imagem falhou em todos os tiers — publicação bloqueada (image_pipeline_failed).",
  };
}
