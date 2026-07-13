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
});
