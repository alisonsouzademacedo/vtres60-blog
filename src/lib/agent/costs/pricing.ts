// Fase 6 (Secao 33) — fonte canonica e VERSIONADA de precos por
// provider/modelo. Nenhum valor de preco deve existir solto em outro
// arquivo do agente; qualquer calculo de custo importa daqui.
//
// AVISO IMPORTANTE (honestidade obrigatoria — ver Secao 29/63 do prompt da
// Fase 6): WebSearch e WebFetch estavam BLOQUEADOS nesta sessao (politica
// de permissao do ambiente, nao falha tecnica) — nao foi possivel
// reverificar estes precos ao vivo na documentacao oficial dos providers
// HOJE. Os valores abaixo vem do conhecimento de treinamento do modelo,
// nao de uma consulta live. `verified: false` e `lastVerifiedAt: undefined`
// refletem isso deliberadamente. NÃO confie nestes valores para decisao
// financeira real sem antes conferir source_url manualmente e atualizar
// verified/lastVerifiedAt.
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
    verified: false,
    lastVerifiedAt: undefined,
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
