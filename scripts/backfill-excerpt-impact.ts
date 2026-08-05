/**
 * Backfill pontual de excerpt/impact (Fase 2) para posts publicados pelo
 * Agente Autonomo ANTES da mudanca de prompt/schema que passou a exigir
 * esses dois campos diretamente do Drafter.
 *
 * Opera SOMENTE sobre a lista explicita de IDs abaixo (validada
 * manualmente na sessao da Fase 2 — ver docs/backup-fase2-saneamento-*.json
 * para o snapshot completo). Nao aceita IDs por argumento nem por query
 * aberta no banco — isso e proposital: o objetivo e nao correr o risco de
 * atingir um post publicado pelo worker (cron 05h/17h) depois desta lista
 * ter sido fechada.
 *
 * Uso:
 *   npx tsx scripts/backfill-excerpt-impact.ts            (dry-run, padrao)
 *   npx tsx scripts/backfill-excerpt-impact.ts --apply     (aplica no Supabase)
 */
import { z } from "zod";
import {
  EXCERPT_IMPACT_OVERLAP_THRESHOLD,
  ctaParagraphStatus,
  jaccardSimilarity,
  metaDescriptionFrom,
  stripV360ClosingParagraph,
  validateExcerpt,
  validateImpact,
} from "../src/lib/agent/text-guards";
import {
  assertSafeToWrite,
  buildManifest,
  describeDestination,
  loadEnvSafely,
  printManifest,
  resolveDestination,
  writeManifest,
} from "./lib/safe-target";

// Fechamento da Fase 9B.1: nunca mais dotenv.config({override:true}) — ver
// scripts/lib/safe-target.ts. loadEnvSafely() é chamado dentro de main().

export const VALIDATED_IDS = [
  "c875a805-f2f9-4c02-a85a-e4c098f9c639", // Grupo RIMA: Inovação e Liderança na Metalurgia Brasileira
  "0fe0c393-8249-4a29-a2c8-468955c7ff50", // O Que o Crescimento do E-commerce Ensina à Indústria
  "24198c61-ce19-4b3e-b5ac-fe893458edd3", // Indústria Brasileira Defende Relações Comerciais com os EUA em Audiências
  "a5bc4c5e-c87a-415b-9a57-db3708c23185", // Impacto de Tarifas dos EUA nas Exportações Brasileiras
  "6c2961a2-aefc-49c5-b5ec-8849a4addd1e", // Expansão da BYD no Brasil: Integração de Novos Colaboradores em Camaçari
  "024dd189-67c3-4109-b869-244febe58eb7", // Impactos da Nova Indústria Brasil na Modernização do Setor Produtivo (draft)
  "12f8204c-68c5-447f-9655-9871ef65e312", // Indústria de Minas Gerais Mostra Resiliência Apesar de Queda no Faturamento
  "d61a32ff-ab4f-469d-959f-a25701143c35", // Impacto das Tarifas Americanas no Setor de Ferro-Gusa Brasileiro
  "4188ec03-a71b-4422-9e09-784099024879", // Indústria Paulista Enfrenta Desempenho Desafiador em 2026
] as const;

export interface PostRow {
  id: string;
  title: string;
  slug: string;
  source_name: string;
  source_url: string;
  created_at: string;
  published_at: string;
  updated_at: string;
  status: string;
  excerpt: string;
  impact: string;
  content: string;
  seo: Record<string, unknown>;
}

export type CtaDetection = "true" | "false" | "ambiguous";
export type RowStatus = "approved" | "rejected" | "ambiguous";

export interface ClassificationResult {
  excerptProposto: string;
  excerptValid: boolean;
  excerptIssues: string[];
  impactProposto: string;
  impactValid: boolean;
  impactIssues: string[];
  overlapScore: number;
  overlapThreshold: number;
  ctaDetected: CtaDetection;
  ctaSnippet: string | null;
  proposedBody: string;
  bodyWouldChange: boolean;
  metaDescriptionProposta: string;
  status: RowStatus;
  reason?: string;
}

export const BackfillSchema = z.object({
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
});

export const BACKFILL_SYSTEM_PROMPT =
  "Você é o Redator Sênior da V360 fazendo um backfill editorial. Gere APENAS excerpt e impact para a matéria " +
  "abaixo — NÃO reescreva o corpo, NÃO gere novo título, categoria, tags ou empresas. excerpt é um resumo curto " +
  "(1-2 frases) do fato central, terminando em pontuação completa, sem reticências, sem CTA. impact é uma análise " +
  "curta e DIFERENTE do excerpt sobre o que o fato muda para a indústria — pode inferir, mas deixando claro que é " +
  "análise (ex: 'o movimento pode...'), sem repetir o excerpt nem o primeiro parágrafo, sem CTA, sem mencionar a V360.";

export function backfillUserMessage(row: Pick<PostRow, "title" | "source_name" | "source_url" | "content">): string {
  return `TÍTULO:\n${row.title}\n\nFONTE: ${row.source_name || "desconhecida"} (${row.source_url || "sem URL"})\n\nCORPO:\n${row.content}`;
}

/**
 * Logica pura de classificacao — sem I/O. Recebe a proposta ja gerada pelo
 * LLM (excerpt/impact) e o body atual do post, aplica os validadores
 * deterministicos (text-guards.ts) e o detector de CTA legado, e decide o
 * status final (approved/rejected/ambiguous). Testavel com fixtures, sem
 * precisar mockar Supabase nem LLM.
 */
export function classifyDraft(
  row: Pick<PostRow, "title" | "content" | "seo">,
  draftExcerpt: string,
  draftImpact: string,
): ClassificationResult {
  const excerptCheck = validateExcerpt(draftExcerpt, row.title);
  const impactCheck = validateImpact(draftImpact, draftExcerpt, row.content);
  const overlap = jaccardSimilarity(draftImpact, draftExcerpt);

  const ctaStatus = ctaParagraphStatus(row.content);
  const ctaDetected: CtaDetection = ctaStatus === "ok" ? "true" : ctaStatus === "unwrapped" ? "ambiguous" : "false";
  const proposedBody = ctaDetected === "true" ? stripV360ClosingParagraph(row.content) : row.content;
  const bodyWouldChange = proposedBody !== row.content;
  const ctaSnippetMatch = ctaDetected === "true" ? /:::highlight[\s\S]*?:::highlight/i.exec(row.content) : null;

  let status: RowStatus;
  let reason: string | undefined;
  if (!excerptCheck.valid || !impactCheck.valid) {
    status = "rejected";
    reason = [...excerptCheck.issues, ...impactCheck.issues].join(" | ");
  } else if (ctaDetected === "ambiguous") {
    status = "ambiguous";
    reason =
      'CTA/menção à V360 encontrada sem o wrapper ":::highlight" — não é seguro classificar automaticamente como ' +
      "legado a remover. Preservando post inteiro (excerpt/impact também não serão atualizados nesta rodada, por segurança).";
  } else {
    status = "approved";
  }

  return {
    excerptProposto: draftExcerpt,
    excerptValid: excerptCheck.valid,
    excerptIssues: excerptCheck.issues,
    impactProposto: draftImpact,
    impactValid: impactCheck.valid,
    impactIssues: impactCheck.issues,
    overlapScore: overlap,
    overlapThreshold: EXCERPT_IMPACT_OVERLAP_THRESHOLD,
    ctaDetected,
    ctaSnippet: ctaSnippetMatch?.[0] ?? null,
    proposedBody,
    bodyWouldChange: status === "approved" && bodyWouldChange,
    metaDescriptionProposta: metaDescriptionFrom(draftExcerpt),
    status,
    reason,
  };
}

/**
 * Monta o payload MINIMO de update para um registro approved — so inclui
 * content quando o CTA legado foi de fato removido. Retorna null se o
 * status nao for "approved" (nada a aplicar).
 */
export function buildUpdatePatch(
  classification: ClassificationResult,
  currentSeo: Record<string, unknown>,
): Record<string, unknown> | null {
  if (classification.status !== "approved") return null;
  const patch: Record<string, unknown> = {
    excerpt: classification.excerptProposto,
    impact: classification.impactProposto,
    seo: { ...currentSeo, metaDescription: classification.metaDescriptionProposta },
    updated_at: new Date().toISOString(),
  };
  if (classification.bodyWouldChange) {
    patch.content = classification.proposedBody;
  }
  return patch;
}

async function loadIoDeps() {
  // Import dinamico proposital, DEPOIS do config() acima — mesma razao de
  // scripts/migrate-to-supabase.ts: supabaseAdmin/llm leem process.env no
  // carregamento do modulo, que aconteceria antes do config() se fosse um
  // import estatico no topo do arquivo.
  const { supabaseAdmin } = await import("../src/lib/supabase");
  const { llm } = await import("../src/lib/agent/llm");
  return { supabaseAdmin, llm };
}

async function main() {
  loadEnvSafely();

  const apply = process.argv.includes("--apply");
  const allowProduction = process.argv.includes("--allow-production");
  const destination = resolveDestination();
  const { supabaseAdmin, llm } = await loadIoDeps();

  console.log(`Modo: ${apply ? "APLICAÇÃO REAL" : "DRY-RUN (nenhum UPDATE será executado)"}`);
  console.log(`Destino: ${describeDestination(destination)}\n`);
  console.log(`IDs validados: ${VALIDATED_IDS.length}\n`);

  const { data: rows, error } = await supabaseAdmin
    .from("posts")
    .select("id, title, slug, source_name, source_url, created_at, published_at, updated_at, status, excerpt, impact, content, seo")
    .in("id", VALIDATED_IDS as unknown as string[]);
  if (error) throw new Error(`Falha ao consultar posts: ${error.message}`);
  if (!rows || rows.length !== VALIDATED_IDS.length) {
    throw new Error(
      `Esperava ${VALIDATED_IDS.length} registros da lista explícita, encontrou ${rows?.length ?? 0}. Abortando — não prosseguir com lista divergente.`,
    );
  }
  const postRows = rows as PostRow[];

  const writer = llm.withStructuredOutput(BackfillSchema);
  const snapshot = new Map<string, { classification: ClassificationResult; updatedAt: string }>();

  for (const id of VALIDATED_IDS) {
    const row = postRows.find((r) => r.id === id);
    if (!row) throw new Error(`ID ${id} da lista explícita não encontrado no Supabase.`);

    console.log(`> ${row.title} (${row.id})`);
    const draft = await writer.invoke([
      { role: "system", content: BACKFILL_SYSTEM_PROMPT },
      { role: "user", content: backfillUserMessage(row) },
    ]);

    const classification = classifyDraft(row, draft.excerpt, draft.impact);
    snapshot.set(id, { classification, updatedAt: row.updated_at });
  }

  console.log("\n=== RESULTADO DO DRY-RUN ===\n");
  for (const id of VALIDATED_IDS) {
    const row = postRows.find((r) => r.id === id)!;
    const { classification: c } = snapshot.get(id)!;
    console.log(`--- ${row.title} (${row.id}) ---`);
    console.log(`  status final: ${c.status}${c.reason ? ` — ${c.reason}` : ""}`);
    console.log(`  excerpt atual:    ${row.excerpt}`);
    console.log(`  excerpt proposto: ${c.excerptProposto} (válido: ${c.excerptValid}${c.excerptIssues.length ? `, issues: ${c.excerptIssues.join("; ")}` : ""})`);
    console.log(`  impact atual:    ${row.impact || "(vazio)"}`);
    console.log(`  impact proposto: ${c.impactProposto} (válido: ${c.impactValid}${c.impactIssues.length ? `, issues: ${c.impactIssues.join("; ")}` : ""})`);
    console.log(`  sobreposição excerpt/impact: ${(c.overlapScore * 100).toFixed(1)}% (limite: ${(c.overlapThreshold * 100).toFixed(0)}%)`);
    console.log(`  CTA legado detectado: ${c.ctaDetected}${c.ctaSnippet ? `\n    trecho: ${c.ctaSnippet}` : ""}`);
    console.log(`  body seria alterado: ${c.bodyWouldChange}`);
    console.log(`  metaDescription atual:    ${(row.seo as { metaDescription?: string })?.metaDescription ?? ""}`);
    console.log(`  metaDescription proposta: ${c.metaDescriptionProposta}`);
    console.log("");
  }

  const entries = [...snapshot.entries()];
  const approved = entries.filter(([, v]) => v.classification.status === "approved");
  const rejected = entries.filter(([, v]) => v.classification.status === "rejected");
  const ambiguous = entries.filter(([, v]) => v.classification.status === "ambiguous");
  console.log(`Aprovados: ${approved.length} | Rejeitados: ${rejected.length} | Ambíguos: ${ambiguous.length}\n`);

  const manifest = buildManifest({
    script: "backfill-excerpt-impact.ts",
    destination,
    mode: apply ? "apply" : "dry-run",
    entities: "posts (excerpt/impact)",
    quantity: approved.length,
    ids: approved.map(([id]) => id),
    rollbackPlan: "restaurar excerpt/impact/content/seo.metaDescription originais a partir do snapshot em docs/backup-fase2-saneamento-*.json (ver cabeçalho deste arquivo).",
  });
  printManifest(manifest);
  await writeManifest(manifest);

  if (!apply) {
    console.log("Dry-run concluído. Nenhum UPDATE foi executado. Rode com --apply para aplicar somente os aprovados.");
    return;
  }
  if (approved.length === 0) {
    console.log("Nenhum registro aprovado — nada a aplicar.");
    return;
  }

  assertSafeToWrite(destination, {
    allowProduction,
    apply: true,
    dryRun: false,
    manifestGenerated: true,
    idempotencyKey: manifest.idempotencyKey,
    actor: manifest.actor,
  });

  console.log("=== VERIFICAÇÃO DE CONCORRÊNCIA ===\n");
  const approvedIds = approved.map(([id]) => id);
  const { data: recheckRows, error: recheckError } = await supabaseAdmin
    .from("posts")
    .select("id, updated_at")
    .in("id", approvedIds);
  if (recheckError) throw new Error(`Falha na releitura de concorrência: ${recheckError.message}`);

  const toApply: string[] = [];
  for (const [id, snap] of approved) {
    const current = recheckRows?.find((row) => row.id === id);
    if (!current || current.updated_at !== snap.updatedAt) {
      console.log(`CONCURRENT_CHANGE_DETECTED em ${id} — updated_at mudou desde o dry-run. Pulando este registro.`);
      continue;
    }
    toApply.push(id);
  }

  console.log(`\n${toApply.length} registro(s) sem alteração concorrente — aplicando update mínimo.\n`);

  for (const id of toApply) {
    const original = postRows.find((r) => r.id === id)!;
    const { classification } = snapshot.get(id)!;
    const patch = buildUpdatePatch(classification, original.seo ?? {});
    if (!patch) continue;

    const { error: updateError } = await supabaseAdmin.from("posts").update(patch).eq("id", id);
    if (updateError) {
      console.log(`ERRO ao atualizar ${id}: ${updateError.message}. Parando aplicação dos próximos registros.`);
      break;
    }

    const { data: reread, error: rereadError } = await supabaseAdmin
      .from("posts")
      .select("id, title, excerpt, impact, content, source_url, category_id, featured_image, created_at, published_at")
      .eq("id", id)
      .maybeSingle();
    if (rereadError || !reread) {
      console.log(`ERRO na releitura pós-update de ${id}: ${rereadError?.message}. Parando aplicação dos próximos registros.`);
      break;
    }

    const divergent =
      reread.excerpt !== classification.excerptProposto ||
      reread.impact !== classification.impactProposto ||
      reread.source_url !== original.source_url ||
      reread.created_at !== original.created_at ||
      reread.title !== original.title;
    if (divergent) {
      console.log(`DIVERGÊNCIA na releitura pós-update de ${id} — parando aplicação dos próximos registros.`);
      console.log(JSON.stringify(reread, null, 2));
      break;
    }

    console.log(`OK — ${id} (${original.title}) atualizado e releitura confirmada.`);
  }
}

if (process.argv[1] && process.argv[1].endsWith("backfill-excerpt-impact.ts")) {
  main().catch((error) => {
    console.error("\nBackfill falhou:", error);
    process.exitCode = 1;
  });
}
