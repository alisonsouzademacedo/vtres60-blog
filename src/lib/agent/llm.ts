import { ChatOpenAI } from "@langchain/openai";

/**
 * Client de LLM unico do agente — todos os nos importam `llm` daqui.
 *
 * Chave de API: defina OPENAI_API_KEY em .env.local (nunca commitar).
 *
 * Para trocar de provedor (ex: Google Gemini), instale `@langchain/google-genai`
 * e troque apenas este arquivo por algo como:
 *
 *   import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
 *   export const llm = new ChatGoogleGenerativeAI({
 *     apiKey: process.env.GOOGLE_API_KEY,
 *     model: "gemini-1.5-pro",
 *     temperature: 0.4,
 *   });
 *
 * Nenhum outro arquivo em src/lib/agent/ precisa mudar — todos usam a
 * interface generica `BaseChatModel` (invoke / withStructuredOutput).
 */
export const llm = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4o",
  temperature: 0.4,
  // Fase 6 — risco real encontrado na auditoria: era o UNICO provider do
  // pipeline sem timeout/retry configurado (GNews/Pexels: 10s; Replicate:
  // 35s+polling). Sem isso, um hang do lado da OpenAI travaria a execucao
  // inteira do LangGraph indefinidamente — nenhum outro gate depende do
  // LLM sem um teto de tempo. 60s cobre com folga o structured output dos
  // 5 nos que usam este client (Drafter e o mais pesado, ate ~800 chars de
  // corpo no prompt). maxRetries:2 e o mesmo padrao de "poucas tentativas,
  // nunca infinito" usado no MAX_DRAFT_ATTEMPTS do Drafter.
  timeout: 60_000,
  maxRetries: 2,
});
