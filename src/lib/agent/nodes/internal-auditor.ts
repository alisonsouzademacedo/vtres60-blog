import { z } from "zod";
import { llm } from "../llm";
import { invokeWithUsageTelemetry } from "../costs/record-llm-usage";
import { AUDITOR_SYSTEM_PROMPT } from "../prompts";
import { findBannedClosingPhrases, validateDirectQuotes, validateExcerpt, validateImpact } from "../text-guards";
import { isValidCategoryId, loadValidCategories } from "../taxonomies";
import type { AgentState, AgentStateUpdate } from "../state";

const AuditSchema = z.object({
  approved: z.boolean().describe("true somente se nenhuma informacao inventada foi encontrada"),
  issues: z
    .array(z.string())
    .describe("Trechos ou dados do texto reescrito sem respaldo no original. Vazio se aprovado."),
  feedback: z.string().describe("Instrucao objetiva para o redator corrigir, caso reprovado. Vazio se aprovado."),
});

// Mesma logica para o TITULO: um ano estritamente anterior ao ano atual
// e quase sempre sinal de conteudo desatualizado (ex: "Tendencias para
// 2025" publicado em 2026) — checagem mecanica, nao fica a criterio do
// LLM perceber isso sozinho (visto em producao: nao percebeu em 3
// tentativas seguidas na mesma fonte antiga). Nao se aplica ao CORPO do
// texto: mencionar um ano passado em tempo verbal correto (historico) e
// legitimo e ate desejavel ali — so o titulo e checado aqui, a nuance de
// tempo verbal no corpo fica com a FRENTE 3 do LLM (AUDITOR_SYSTEM_PROMPT).
function findStaleYearsInTitle(title: string): string[] {
  const currentYear = new Date().getFullYear();
  const years = title.match(/\b(19|20)\d{2}\b/g) ?? [];
  return years.filter((year) => Number(year) < currentYear);
}

/**
 * Barreira de seguranca contra alucinacao: compara `draftText` com
 * `sourceText` (o texto original extraido) e reprova qualquer dado que
 * nao esteja no original. Nao usa conhecimento externo — julga
 * estritamente pelo texto fornecido (ver AUDITOR_SYSTEM_PROMPT).
 *
 * Antes de chamar o LLM, roda checagens deterministicas (cliche de
 * fechamento, ano desatualizado no titulo, validade de excerpt/impact) —
 * mais rapido, mais barato (pula a chamada ao LLM quando ja da pra saber
 * que vai reprovar) e 100% confiavel para esses padroes objetivos.
 */
export async function internalAuditorNode(state: AgentState): Promise<AgentStateUpdate> {
  const titulo = state.finalPost?.titulo ?? "";

  // Junta TODOS os problemas mecanicos numa unica reprovacao (em vez de
  // retornar no primeiro encontrado) — visto em producao: corrigir um
  // problema por vez custava uma rodada inteira de redacao+auditoria por
  // problema, e 3 tentativas nao bastavam quando havia mais de um.
  const mechanicalIssues: string[] = [];

  const bannedPhrases = findBannedClosingPhrases(state.draftText);
  if (bannedPhrases.length) {
    mechanicalIssues.push(
      `Remova o(s) conectivo(s) de fechamento de redação escolar: ${bannedPhrases.map((phrase) => `"${phrase}"`).join(", ")} — feche o texto com uma ideia, não com um rótulo de conclusão.`,
    );
  }

  const staleYears = findStaleYearsInTitle(titulo);
  if (staleYears.length) {
    mechanicalIssues.push(
      `O título ainda contém o(s) ano(s) ${staleYears.join(", ")}, já encerrado(s) em relação a hoje — reescreva o título sem citar nenhum ano específico (prefira uma formulação atemporal).`,
    );
  }

  // Fase 2: excerpt/impact sao gerados pelo Drafter (DraftSchema) e
  // validados aqui deterministicamente ANTES da chamada ao LLM — mesmo
  // padrao ja usado para cliches e ano desatualizado (dois-layer: checagem
  // mecanica primeiro, mais barata e 100% confiavel para esses padroes
  // objetivos; LLM so entra para o que exige julgamento).
  const excerpt = state.finalPost?.excerpt ?? "";
  const impact = state.finalPost?.impact ?? "";

  const excerptCheck = validateExcerpt(excerpt, titulo);
  if (!excerptCheck.valid) {
    mechanicalIssues.push(`Corrija o excerpt: ${excerptCheck.issues.join("; ")}.`);
  }

  const impactCheck = validateImpact(impact, excerpt, state.draftText);
  if (!impactCheck.valid) {
    mechanicalIssues.push(`Corrija o impact: ${impactCheck.issues.join("; ")}.`);
  }

  // Fase 3: citacao direta entre aspas so e aceita se existir literalmente
  // no texto original (ver text-guards.ts validateDirectQuotes) — HARD
  // FAIL deterministico, nao fica a criterio do LLM decidir se uma
  // paráfrase "conta" como a mesma declaracao.
  const quoteCheck = validateDirectQuotes(state.draftText, state.sourceText);
  if (!quoteCheck.valid) {
    mechanicalIssues.push(
      `Remova as aspas ou reescreva como paráfrase factual sustentada — as citações a seguir não existem literalmente no texto original: ${quoteCheck.issues.join("; ")}.`,
    );
  }

  // Fase 3: categoryId e obrigatorio e deve pertencer ao conjunto real de
  // categorias (public.categories) NESTA execucao — validacao de ID e
  // sempre por codigo, nunca por "parece uma categoria boa" do LLM. A
  // analise semantica de qual categoria e a mais correta fica com o
  // Drafter (que recebe a lista real) e, secundariamente, com o proprio
  // LLM auditor mais abaixo — mas a EXISTENCIA do id e checada aqui.
  const categoryId = state.finalPost?.categoryId ?? "";
  const validCategories = await loadValidCategories();
  if (!categoryId) {
    mechanicalIssues.push("categoryId ausente — escolha um id da lista de categorias válidas fornecida.");
  } else if (!isValidCategoryId(categoryId, validCategories)) {
    mechanicalIssues.push(
      `categoryId "${categoryId}" não existe na lista de categorias válidas — escolha exclusivamente um dos ids fornecidos.`,
    );
  }

  if (mechanicalIssues.length) {
    const feedback = mechanicalIssues.join(" ");
    // eslint-disable-next-line no-console -- diagnostico de producao: sem
    // isso, o motivo exato de cada reprovacao se perdia (so o currentStep
    // generico "reprovou" chegava ao stream/log), dificultando entender
    // por que uma execucao caiu no fallback de emergencia. O preview do
    // final do rascunho ajuda a ver rapido o problema sem precisar
    // consultar o banco depois.
    console.log(
      `[InternalAuditor] tentativa ${state.draftAttempts} reprovada (mecanica): ${feedback}\n  Fim do rascunho: ...${state.draftText.slice(-200)}`,
    );
    return {
      auditApproved: false,
      auditFeedback: feedback,
      currentStep: `Auditoria reprovou o texto (tentativa ${state.draftAttempts}) — reescrevendo...`,
    };
  }

  const auditor = llm.withStructuredOutput(AuditSchema, { includeRaw: true });

  const today = new Date().toISOString().slice(0, 10);

  // attemptNumber = state.draftAttempts: o Drafter ja incrementou este
  // contador ANTES do grafo chegar aqui (mesma tentativa, dois lados do
  // ciclo Drafter<->InternalAuditor) — Secao 8: cada tentativa real vira
  // sua propria linha em agent_provider_usage, nunca sobrescrita.
  const verdict = await invokeWithUsageTelemetry(
    { runId: state.runId, operation: "internal_audit", modelRequested: "gpt-4o", attemptNumber: state.draftAttempts },
    () =>
      auditor.invoke([
        { role: "system", content: AUDITOR_SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Data de hoje: ${today}\n\n` +
            `TÍTULO PROPOSTO:\n${titulo}\n\n` +
            `DOMÍNIO DA EMPRESA PROPOSTO: ${state.companyDomain ?? "nenhum"}\n\n` +
            `TEXTO ORIGINAL:\n${state.sourceText}\n\n---\n\nTEXTO REESCRITO:\n${state.draftText}`,
        },
      ]),
  );

  if (!verdict.approved) {
    // eslint-disable-next-line no-console -- mesmo motivo do log mecanico acima.
    console.log(
      `[InternalAuditor] tentativa ${state.draftAttempts} reprovada (LLM): ${verdict.feedback} | issues: ${verdict.issues.join("; ")}`,
    );
  }

  return {
    auditApproved: verdict.approved,
    auditFeedback: verdict.approved ? undefined : `${verdict.feedback}\nTrechos problematicos: ${verdict.issues.join("; ")}`,
    currentStep: verdict.approved
      ? "Auditoria aprovada, buscando imagem..."
      : `Auditoria reprovou o texto (tentativa ${state.draftAttempts}) — reescrevendo...`,
  };
}
