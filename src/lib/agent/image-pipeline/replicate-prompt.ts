// Fase 4 — prompt de geracao Replicate/Flux-schnell atualizado (Secoes
// 22/23/24/29/30 do spec). Substitui o prompt generico anterior
// ("A realistic industrial factory scene, raw photography, highly
// detailed: ${keyword}"), que produzia o lote generico de "AI industrial
// blue" / dois trabalhadores olhando tablet ao lado de braco robotico.

const NEGATIVE_RULES = [
  "no text",
  "no letters",
  "no readable signage",
  "no numbers",
  "no charts",
  "no invented logos",
  "no distorted brands",
  "no floating UI",
  "no holograms",
  "no HUD",
  "no cyberpunk",
  "no excessive blue neon",
  "no sci-fi factory",
  "no physically impossible machinery",
  "no malformed hands",
  "no extra limbs",
  "no incorrect PPE",
  "no generic AI industrial scene",
  "avoid the cliché composition of two workers looking at a tablet beside a robotic arm",
].join(", ");

const POSITIVE_RULES = [
  "professional photorealistic industrial editorial photography",
  "corporate publication quality",
  "physically plausible industrial environment",
  "technically coherent machinery and infrastructure",
  "realistic photographic lighting",
  "natural depth",
  "high material and surface detail",
  "composition designed for a 2.15:1 editorial aspect ratio",
  "main subject inside a safe crop area",
  "realistic occupational safety equipment when workers are visible",
  "credible Brazilian industrial context when relevant, without pretending to reproduce a specific real location",
].join(", ");

export interface ReplicatePromptInput {
  titulo: string;
  excerpt: string;
  impact: string;
  imageKeyword: string;
  categoryName: string | undefined;
}

// Nao envia o corpo/source completo da materia (evita ruido e custo
// desnecessario) nem listas de tags/companies (irrelevantes para geracao
// visual) — apenas titulo/excerpt/impact/keyword/categoria, o suficiente
// para adaptar o conceito ao FATO especifico sem fabricar um registro
// documental do evento real (ver Secao 24/30 — regra critica, nao
// generica).
export function buildReplicatePrompt(input: ReplicatePromptInput): string {
  const context = [
    `Notícia: ${input.titulo}`,
    `Resumo: ${input.excerpt}`,
    `Análise/impacto: ${input.impact}`,
    input.categoryName ? `Categoria: ${input.categoryName}` : undefined,
    `Palavras-chave visuais: ${input.imageKeyword}`,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    `Editorial industrial illustration (photorealistic concept, NOT a documentary photograph of the specific real event) ` +
    `representing the following news context: ${context}. ` +
    `This must be a plausible generic editorial illustration of the underlying industrial theme — never a fabricated ` +
    `depiction of a specific real person, company logo, signed document, meeting, ceremony, authority, protest, or ` +
    `accident described in the text. ${POSITIVE_RULES}. ${NEGATIVE_RULES}.`
  );
}
