import axios from "axios";
import { supabaseAdmin } from "@/lib/supabase";

// Fase 6 (Secao 26) — health check minimo, server-side-only, de cada
// provider real do pipeline. NUNCA gera conteudo (sem completion de LLM,
// sem imagem do Replicate, sem post no Supabase) — so confirma
// autenticacao/conectividade com a chamada mais barata que cada API
// oficialmente expoe para isso.
export type ProviderHealthStatus = "healthy" | "degraded" | "unavailable" | "not_configured" | "billing_unknown";

export interface ProviderHealthResult {
  provider: "openai" | "gnews" | "replicate" | "pexels" | "supabase";
  status: ProviderHealthStatus;
  detail: string;
  latencyMs?: number;
  checkedAt: string;
}

function result(
  provider: ProviderHealthResult["provider"],
  status: ProviderHealthStatus,
  detail: string,
  latencyMs?: number,
): ProviderHealthResult {
  return { provider, status, detail, latencyMs, checkedAt: new Date().toISOString() };
}

/**
 * OpenAI — GET /v1/models e o endpoint oficial mais barato para validar
 * uma API key: autentica sem gerar nenhum completion (nao consome tokens
 * de saida). Confirma tambem, na lista retornada, se o modelo configurado
 * (gpt-4o) esta de fato disponivel para esta chave.
 */
export async function checkOpenAiHealth(): Promise<ProviderHealthResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return result("openai", "not_configured", "OPENAI_API_KEY ausente.");

  const startedAt = Date.now();
  try {
    const { data, status } = await axios.get("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 10_000,
      validateStatus: () => true,
    });
    const latencyMs = Date.now() - startedAt;
    if (status === 401) return result("openai", "unavailable", "API key inválida ou revogada (401).", latencyMs);
    if (status === 429) return result("openai", "degraded", "Rate limit atingido (429).", latencyMs);
    if (status >= 500) return result("openai", "unavailable", `Erro no servidor da OpenAI (${status}).`, latencyMs);
    if (status !== 200) return result("openai", "degraded", `Resposta inesperada (HTTP ${status}).`, latencyMs);
    const models: string[] = Array.isArray(data?.data) ? data.data.map((m: { id?: string }) => m.id) : [];
    const hasConfiguredModel = models.includes("gpt-4o");
    return result(
      "openai",
      hasConfiguredModel ? "healthy" : "degraded",
      hasConfiguredModel ? "Autenticado; modelo gpt-4o disponível." : "Autenticado, mas gpt-4o não aparece na lista de modelos desta chave.",
      latencyMs,
    );
  } catch (error) {
    return result("openai", "unavailable", error instanceof Error ? error.message : "Falha de conexão desconhecida.", Date.now() - startedAt);
  }
}

/**
 * GNews — consulta minima (max:1) para nao gastar cota alem do
 * estritamente necessario para confirmar autenticacao. GNews nao expoe
 * endpoint de saldo/quota separado; o proprio corpo da resposta de erro ja
 * distingue chave invalida de cota esgotada.
 */
export async function checkGNewsHealth(): Promise<ProviderHealthResult> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return result("gnews", "not_configured", "GNEWS_API_KEY ausente.");

  const startedAt = Date.now();
  try {
    const { status, data } = await axios.get("https://gnews.io/api/v4/search", {
      params: { q: "indústria", lang: "pt", country: "br", max: 1, apikey: apiKey },
      timeout: 10_000,
      validateStatus: () => true,
    });
    const latencyMs = Date.now() - startedAt;
    if (status === 401 || status === 403) return result("gnews", "unavailable", `Chave inválida ou sem permissão (HTTP ${status}).`, latencyMs);
    if (status === 429) return result("gnews", "degraded", "Cota diária esgotada (429).", latencyMs);
    if (status !== 200) return result("gnews", "degraded", `Resposta inesperada (HTTP ${status}).`, latencyMs);
    return result("gnews", "healthy", `Autenticado; ${data?.totalArticles ?? 0} artigo(s) disponível(is) para a busca de teste.`, latencyMs);
  } catch (error) {
    return result("gnews", "unavailable", error instanceof Error ? error.message : "Falha de conexão desconhecida.", Date.now() - startedAt);
  }
}

/**
 * Replicate — GET no MODELO (nao cria prediction, nao gera imagem, custo
 * zero) para confirmar autenticacao e disponibilidade do modelo
 * black-forest-labs/flux-schnell. LIMITACAO HONESTA: Replicate so cobra
 * (e so revela problema de billing/credito, ex. HTTP 402) no momento de
 * CRIAR uma prediction — uma checagem que nao gera imagem, por definicao,
 * nao consegue confirmar saldo/credito disponivel. Ver detail do retorno.
 */
export async function checkReplicateHealth(): Promise<ProviderHealthResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return result("replicate", "not_configured", "REPLICATE_API_TOKEN ausente.");

  const startedAt = Date.now();
  try {
    const { status } = await axios.get("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell", {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10_000,
      validateStatus: () => true,
    });
    const latencyMs = Date.now() - startedAt;
    if (status === 401) return result("replicate", "unavailable", "Token inválido ou revogado (401).", latencyMs);
    if (status === 404) return result("replicate", "degraded", "Modelo flux-schnell não encontrado (404) — verificar nome/versão.", latencyMs);
    if (status !== 200) return result("replicate", "degraded", `Resposta inesperada (HTTP ${status}).`, latencyMs);
    return result(
      "replicate",
      "billing_unknown",
      "Autenticação e modelo confirmados. Saldo/crédito NÃO verificado — só é revelado ao criar uma predição real (custo), o que este health check não faz.",
      latencyMs,
    );
  } catch (error) {
    return result("replicate", "unavailable", error instanceof Error ? error.message : "Falha de conexão desconhecida.", Date.now() - startedAt);
  }
}

/**
 * Pexels — consulta minima (per_page:1) so para autenticar. Pexels e
 * gratuito (sem custo monetario por request), entao "saldo" nao se aplica
 * — so ha cota de requisicoes/hora.
 */
export async function checkPexelsHealth(): Promise<ProviderHealthResult> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return result("pexels", "not_configured", "PEXELS_API_KEY ausente.");

  const startedAt = Date.now();
  try {
    const { status, headers } = await axios.get("https://api.pexels.com/v1/search", {
      params: { query: "industry", per_page: 1 },
      headers: { Authorization: apiKey },
      timeout: 10_000,
      validateStatus: () => true,
    });
    const latencyMs = Date.now() - startedAt;
    if (status === 401) return result("pexels", "unavailable", "API key inválida (401).", latencyMs);
    if (status === 429) return result("pexels", "degraded", "Limite de requisições/hora atingido (429).", latencyMs);
    if (status !== 200) return result("pexels", "degraded", `Resposta inesperada (HTTP ${status}).`, latencyMs);
    const remaining = headers["x-ratelimit-remaining"];
    return result("pexels", "healthy", remaining ? `Autenticado; ${remaining} requisições restantes na cota atual.` : "Autenticado.", latencyMs);
  } catch (error) {
    return result("pexels", "unavailable", error instanceof Error ? error.message : "Falha de conexão desconhecida.", Date.now() - startedAt);
  }
}

/** Supabase — SELECT simples (count) em public.categories, sem custo. */
export async function checkSupabaseHealth(): Promise<ProviderHealthResult> {
  const startedAt = Date.now();
  try {
    const { error } = await supabaseAdmin.from("categories").select("id", { count: "exact", head: true });
    const latencyMs = Date.now() - startedAt;
    if (error) return result("supabase", "unavailable", error.message, latencyMs);
    return result("supabase", "healthy", "Leitura confirmada em public.categories.", latencyMs);
  } catch (error) {
    return result("supabase", "unavailable", error instanceof Error ? error.message : "Falha de conexão desconhecida.", Date.now() - startedAt);
  }
}

export async function checkAllProviders(): Promise<ProviderHealthResult[]> {
  return Promise.all([
    checkOpenAiHealth(),
    checkGNewsHealth(),
    checkReplicateHealth(),
    checkPexelsHealth(),
    checkSupabaseHealth(),
  ]);
}

// Fase 6 (Secao 26) — cache compartilhado em memoria (60s) entre o
// endpoint /api/admin/health (polling client-side) e a Server Component
// admin/agente/page.tsx (render inicial): sem isso, cada carregamento da
// pagina do agente dispararia 5 chamadas reais aos providers de novo.
let cachedResult: { data: ProviderHealthResult[]; expiresAt: number } | undefined;
const HEALTH_CACHE_TTL_MS = 60_000;

export async function getCachedProviderHealth(): Promise<{ providers: ProviderHealthResult[]; cached: boolean }> {
  const now = Date.now();
  if (cachedResult && cachedResult.expiresAt > now) {
    return { providers: cachedResult.data, cached: true };
  }
  const providers = await checkAllProviders();
  cachedResult = { data: providers, expiresAt: now + HEALTH_CACHE_TTL_MS };
  return { providers, cached: false };
}
