// Fase 6 (Secao 33) — fonte canonica e VERSIONADA de precos por
// provider/modelo. Nenhum valor de preco deve existir solto em outro
// arquivo do agente; qualquer calculo de custo importa daqui.
//
// Fase 7 (Secao 13) — tentativa real de reverificacao em 2026-07-15.
// WebFetch permanece bloqueado por politica do ambiente (mesma restricao
// da Fase 6); como alternativa TECNICA equivalente (paginas oficiais via
// rede, nunca busca/memoria), tentou-se `curl` direto nas paginas oficiais
// de cada provider:
//   - openai.com/api/pricing/  -> HTTP 403 (protecao anti-bot). NAO
//     reverificado — permanece verified:false.
//   - replicate.com/black-forest-labs/flux-schnell -> HTTP 200. A propria
//     pagina expoe, em JSON estruturado embutido, "$3 per thousand output
//     images" (metric "image_output_count") — confirma $0.003/imagem.
//     verified:true.
//   - gnews.io -> HTTP 200, mas a tabela de planos e renderizada via JS no
//     cliente; o HTML estatico so confirma a EXISTENCIA de um tier "Free"
//     por cota (sem cobranca monetaria por request), nao os numeros exatos
//     da tabela. O fato que importa para cost_status (gratuito dentro de
//     cota, nao billing por chamada) fica confirmado; o valor numerico
//     "0" permanece verified:false por rigor.
//   - pexels.com/api/documentation/ -> HTTP 403 (protecao anti-bot). NAO
//     reverificado — permanece verified:false.
//   - supabase.com/pricing -> HTTP 200. Confirma armazenamento de Storage:
//     1 GB incluso no plano Free, 100 GB inclusos no Pro, entao $0.0213/GB
//     adicional — ver SUPABASE_STORAGE_REFERENCE abaixo (isso e preco de
//     INFRAESTRUTURA/PLANO, nao "por requisicao"; nunca usado para
//     calcular um custo por upload individual — Secao 12).
//
// Para os valores que continuam verified:false, o numero exibido ainda
// vem do conhecimento de treinamento do modelo (nao de uma consulta live
// bem-sucedida) — NAO confiar para decisao financeira real sem conferir
// sourceUrl manualmente.
export interface ModelPrice {
  provider: "openai" | "replicate" | "gnews" | "pexels";
  model: string;
  unit: "per_1k_input_tokens" | "per_1k_output_tokens" | "per_1k_cached_input_tokens" | "per_image" | "flat_free";
  price: number;
  currency: "USD";
  effectiveFrom: string;
  sourceUrl: string;
  verified: boolean;
  lastVerifiedAt: string | undefined;
}

export const MODEL_PRICES: ModelPrice[] = [
  {
    provider: "openai",
    model: "gpt-4o",
    unit: "per_1k_input_tokens",
    price: 0.0025,
    currency: "USD",
    effectiveFrom: "2024-08-06",
    sourceUrl: "https://openai.com/api/pricing/",
    verified: false,
    lastVerifiedAt: undefined,
  },
  {
    provider: "openai",
    model: "gpt-4o",
    unit: "per_1k_cached_input_tokens",
    price: 0.00125,
    currency: "USD",
    effectiveFrom: "2024-08-06",
    sourceUrl: "https://openai.com/api/pricing/",
    verified: false,
    lastVerifiedAt: undefined,
  },
  {
    provider: "openai",
    model: "gpt-4o",
    unit: "per_1k_output_tokens",
    price: 0.01,
    currency: "USD",
    effectiveFrom: "2024-08-06",
    sourceUrl: "https://openai.com/api/pricing/",
    verified: false,
    lastVerifiedAt: undefined,
  },
  {
    // Replicate cobra por execucao de hardware, nao um preco fixo
    // universal por modelo — flux-schnell e tipicamente listado como
    // preco fixo por imagem pela natureza "schnell" (poucos steps), mas
    // isso PRECISA ser confirmado na pagina do modelo antes de confiar no
    // valor abaixo para qualquer decisao.
    provider: "replicate",
    model: "black-forest-labs/flux-schnell",
    unit: "per_image",
    price: 0.003,
    currency: "USD",
    effectiveFrom: "2024-01-01",
    sourceUrl: "https://replicate.com/black-forest-labs/flux-schnell",
    verified: true,
    lastVerifiedAt: "2026-07-15",
  },
  {
    // GNews e Pexels: gratuitos dentro da cota do plano usado por este
    // projeto (sem custo monetario por request) — nao inventar um preco
    // por chamada quando a API funciona por cota, nao por cobranca
    // (Secao 32: "Se uma API for gratuita dentro de quota... cost = 0
    // somente quando confirmado").
    provider: "gnews",
    model: "search-v4",
    unit: "flat_free",
    price: 0,
    currency: "USD",
    effectiveFrom: "2024-01-01",
    sourceUrl: "https://gnews.io/#pricing",
    verified: false,
    lastVerifiedAt: undefined,
  },
  {
    provider: "pexels",
    model: "search-v1",
    unit: "flat_free",
    price: 0,
    currency: "USD",
    effectiveFrom: "2024-01-01",
    sourceUrl: "https://www.pexels.com/api/documentation/",
    verified: false,
    lastVerifiedAt: undefined,
  },
];

export function findModelPrice(
  provider: ModelPrice["provider"],
  model: string,
  unit: ModelPrice["unit"],
): ModelPrice | undefined {
  return MODEL_PRICES.find((entry) => entry.provider === provider && entry.model === model && entry.unit === unit);
}

// Fase 7 (Secao 12/13) — preco de INFRAESTRUTURA/PLANO do Supabase
// Storage, confirmado ao vivo em supabase.com/pricing (2026-07-15):
// 1 GB incluso no plano Free, 100 GB inclusos no Pro, entao $0.0213/GB
// adicional. Deliberadamente FORA de MODEL_PRICES/ModelPrice: nao e um
// preco "por chamada" (upload) — e cobranca por armazenamento TOTAL
// acumulado no plano, so calculavel olhando o uso agregado da conta, nao
// uma unica requisicao. Existe aqui apenas como referencia informativa
// para o painel admin (Secao 12: separar custo calculavel por requisicao
// de custo de infraestrutura nao atribuivel diretamente) — nunca usado
// para computar `estimated_cost` de uma linha de agent_provider_usage.
export const SUPABASE_STORAGE_PLAN_REFERENCE = {
  currency: "USD" as const,
  freeTierIncludedGb: 1,
  proTierIncludedGb: 100,
  proTierOverageUsdPerGb: 0.0213,
  sourceUrl: "https://supabase.com/pricing",
  verified: true,
  lastVerifiedAt: "2026-07-15",
};

// Fase 9B.0 — estimativas PRE-chamada para o circuit breaker de
// orcamento. Nao confundir com o custo real gravado em
// agent_provider_usage (Secao 8, calculado DEPOIS da chamada a partir do
// usage_metadata real). O guard precisa de um numero ANTES de gastar, pra
// decidir se reserva ou bloqueia — a reserva e sempre reconciliada com o
// custo real assim que a chamada termina (reserve -> executar -> conciliar).
//
// Valores de draft_generation/internal_audit/news_pick/newsworthiness sao
// a media real observada nas 5 execucoes completas do agente desde que a
// telemetria existe (Fase 7, 2026-07-20 a 22), consultada ao vivo via
// Supabase MCP na auditoria da Fase 9A — nao inventados. semantic_dedupe
// NAO tem amostra real (nenhuma linha de agent_provider_usage com essa
// operation nas 45 amostradas) — o valor abaixo e um placeholder
// conservador na mesma ordem de grandeza de internal_audit (compara dois
// textos, operacao semelhante), explicitamente marcado `confirmed:false`.
// Como nenhum modo ENFORCE tem teto aprovado ainda (Fase 9A: nenhum valor
// de orcamento foi aprovado por Pedro), esse placeholder so afeta a soma
// exibida no modo AUDIT hoje, nunca bloqueia nada.
export const DEFAULT_OPENAI_OPERATION_COST_ESTIMATES: Record<string, { costUsd: number; confirmed: boolean }> = {
  draft_generation: { costUsd: 0.015, confirmed: true },
  internal_audit: { costUsd: 0.0074, confirmed: true },
  news_pick: { costUsd: 0.0021, confirmed: true },
  newsworthiness: { costUsd: 0.0044, confirmed: true },
  semantic_dedupe: { costUsd: 0.0074, confirmed: false },
};
