import { z } from "zod";
import { llm } from "../llm";
import { DRAFTER_SYSTEM_PROMPT } from "../prompts";
import type { AgentState, AgentStateUpdate } from "../state";
import {
  formatCategoriesForPrompt,
  formatCompanyHubsForPrompt,
  formatTagsForPrompt,
  loadValidCategories,
  loadValidCompanyHubs,
  loadValidTags,
} from "../taxonomies";

// Teto de tentativas de redacao antes de o grafo desistir (ver
// internal-auditor.ts / workflow.ts). Evita loop infinito Drafter <->
// InternalAuditor caso o texto nunca fique livre de dados inventados.
// 5, nao 3: fontes dificeis (blogs evergreen antigos, com varios cliches
// e o ano errado ao mesmo tempo) as vezes corrigem um problema por
// tentativa e reintroduzem outro — visto em producao, 3 tentativas nao
// foram suficientes para convergir em titulo + cliche + atualidade juntos.
export const MAX_DRAFT_ATTEMPTS = 5;

export const DraftSchema = z.object({
  titulo: z.string().describe("Titulo jornalistico, direto, sem clickbait"),
  conteudo: z.string().describe("Corpo da materia reescrita, paragrafos separados por linha em branco"),
  excerpt: z
    .string()
    .describe(
      "Resumo editorial curto (1-2 frases) do fato central, autossuficiente, terminando em pontuacao de frase " +
        "completa (. ! ou ?). Nunca reticencias, nunca cortado no meio de palavra/sigla, nunca repete o titulo " +
        "literalmente, sem CTA nem mencao a V360/VTRES60.",
    ),
  impact: z
    .string()
    .describe(
      "Analise editorial curta e DIFERENTE do excerpt: o que esse fato muda para a industria (sinal, tendencia, " +
        "decisao afetada). Pode inferir, deixando claro que e analise (ex: 'o movimento pode...'). Nunca repete " +
        "o excerpt nem o primeiro paragrafo do corpo, sem CTA, sem mencionar a V360.",
    ),
  imageKeyword: z.string().describe("3 palavras-chave em ingles, separadas por virgula, para ilustrar a materia"),
  companyDomain: z
    .string()
    .nullable()
    .describe(
      "Dominio oficial do site da empresa que e o foco principal da materia (ex: 'gruporima.com.br'), " +
        "sem protocolo nem caminho. null se a materia nao tiver uma empresa especifica como foco.",
    ),
  categoryId: z
    .string()
    .describe(
      "Um dos IDs de categoria fornecidos na lista de categorias validas desta execucao (mensagem separada). " +
        "Escolha pelo assunto central/fato novo, nunca invente um id fora da lista.",
    ),
  tagIds: z
    .array(z.string())
    .describe(
      "IDs de tags fornecidos (mensagem separada) que sao elemento central ou diretamente relevante da materia. " +
        "Lista vazia e valida e preferivel a associacao remota. Nunca invente ids fora da lista fornecida.",
    ),
  companies: z
    .array(z.string())
    .describe(
      "Nomes EXATOS de empresas com hub editorial (mensagem separada) que sao entidade central do fato — nao " +
        "mencoes secundarias. Lista vazia e valida quando a empresa central nao tiver hub. Nunca invente nomes " +
        "fora da lista fornecida.",
    ),
});

async function loadTaxonomyBlock(): Promise<{ block: string; validCategoryIds: string[]; validTagIds: string[]; validCompanyNames: string[] }> {
  const [categories, tags, hubs] = await Promise.all([loadValidCategories(), loadValidTags(), Promise.resolve(loadValidCompanyHubs())]);
  const block =
    `CATEGORIAS VÁLIDAS (escolha exatamente um id em categoryId):\n${formatCategoriesForPrompt(categories)}\n\n` +
    `TAGS VÁLIDAS (escolha zero ou mais ids em tagIds, apenas as centrais ao fato):\n${formatTagsForPrompt(tags)}\n\n` +
    `EMPRESAS COM HUB EDITORIAL (associe pelo nome exato em companies, apenas se central ao fato; empresas fora ` +
    `desta lista NUNCA devem ser retornadas):\n${formatCompanyHubsForPrompt(hubs)}`;
  return {
    block,
    validCategoryIds: categories.map((category) => category.id),
    validTagIds: tags.map((tag) => tag.id),
    validCompanyNames: hubs.map((hub) => hub.name),
  };
}

/**
 * Reescreve `sourceText` na persona de redator especialista em industria.
 * Se `auditFeedback` estiver preenchido (reprovacao anterior), inclui o
 * motivo da reprovacao no prompt para o LLM corrigir especificamente
 * aquilo, em vez de reescrever do zero.
 */
export async function drafterNode(state: AgentState): Promise<AgentStateUpdate> {
  const writer = llm.withStructuredOutput(DraftSchema);

  // Lembrete do paragrafo final SEMPRE junto do feedback de correcao —
  // visto em producao: ao corrigir um problema apontado (ex: fidelidade
  // factual), o modelo por vezes reescrevia o texto inteiro e "esquecia"
  // o paragrafo final da V360 no processo, mesmo esse nao sendo o motivo
  // da reprovacao. Repetir a exigencia aqui, fora do system prompt,
  // reduz a chance de isso passar despercebido numa correcao pontual.
  const feedbackBlock = state.auditFeedback
    ? `\n\nA versao anterior foi REPROVADA pela auditoria interna pelo motivo abaixo — corrija isso especificamente, sem reintroduzir o mesmo problema:\n${state.auditFeedback}`
    : "";

  const today = new Date().toISOString().slice(0, 10);
  const { block: taxonomyBlock } = await loadTaxonomyBlock();

  const result = await writer.invoke([
    { role: "system", content: DRAFTER_SYSTEM_PROMPT },
    { role: "user", content: taxonomyBlock },
    {
      role: "user",
      content: `Data de hoje: ${today}\n\nMateria original para reescrever:\n\n${state.sourceText}${feedbackBlock}`,
    },
  ]);

  // O LLM as vezes devolve a STRING literal "null" (ou vazia) em vez do
  // valor null de verdade no campo nullable — visto em producao: isso e
  // truthy em JS, entao sem essa normalizacao o ImageProcessor monta um
  // favicon quebrado tipo "...favicons?domain=null&sz=256".
  const companyDomain =
    result.companyDomain && result.companyDomain.trim().toLowerCase() !== "null" ? result.companyDomain.trim() : undefined;

  return {
    draftText: result.conteudo,
    finalPost: {
      titulo: result.titulo,
      conteudo: result.conteudo,
      excerpt: result.excerpt,
      impact: result.impact,
      categoryId: result.categoryId,
      tagIds: result.tagIds,
      companies: result.companies,
    },
    imageKeyword: result.imageKeyword,
    companyDomain,
    draftAttempts: state.draftAttempts + 1,
    currentStep: "Texto redigido, aguardando auditoria...",
  };
}
