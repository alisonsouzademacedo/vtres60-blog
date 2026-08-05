/**
 * Fase 8B — preview de classificação de segmento para os posts existentes.
 *
 * SEMPRE dry-run: lê os posts reais do Supabase, classifica cada um com o
 * mesmo classificador de segmento usado pelo agente (mesma lista real de
 * segmentos válidos, mesmas regras do prompt), valida deterministicamente
 * os slugs propostos e escreve um relatório em Markdown. NÃO grava nenhuma
 * alteração no banco — nenhum modo --apply existe neste arquivo ainda,
 * de propósito: aplicar o backfill em produção é proibido nesta fase
 * (ver docs/implementacao-fase8b-fundacao.md). Adicionar --apply é um
 * trabalho de fase futura, só depois de revisão humana deste preview.
 *
 * Uso:
 *   npx tsx scripts/backfill-segmentos.ts
 *
 * Nunca altera: texto do post, categoria, tags, companies.
 * Idempotente: rodar de novo produz o mesmo relatório (sem side-effects).
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { z } from "zod";
import { describeDestination, loadEnvSafely, resolveDestination } from "./lib/safe-target";

// Fechamento da Fase 9B.1: nunca mais dotenv.config({override:true}) — ver
// scripts/lib/safe-target.ts. Este script nunca escreve no Supabase (só lê
// posts e grava um relatório .md local), então não precisa do guard de
// produção — só da resolução segura de env por consistência.

export type BackfillConfidence = "HIGH_CONFIDENCE" | "AMBIGUOUS" | "NO_SEGMENT" | "ERROR";

export interface BackfillRow {
  id: string;
  title: string;
  slug: string;
  segmentSlugsProposed: string[];
  segmentSlugsRejected: string[];
  llmConfidence: "alta" | "ambigua" | null;
  justification: string;
  classification: BackfillConfidence;
  error?: string;
}

export const SegmentBackfillSchema = z.object({
  segmentSlugs: z
    .array(z.string())
    .describe(
      "Slugs EXATOS da lista de segmentos válidos fornecida, apenas quando o setor tiver relação central ou " +
        "aplicação industrial diretamente comprovável no fato central da notícia. Lista vazia é o resultado " +
        "correto quando nenhum setor for central. Nunca invente slugs fora da lista.",
    ),
  confidence: z
    .enum(["alta", "ambigua"])
    .describe(
      "'alta' quando a relação do(s) segmento(s) com o fato central é evidente e inequívoca no texto; " +
        "'ambigua' quando há alguma dúvida razoável sobre se o setor é realmente central (inclusive quando a " +
        "lista retornada for vazia mas o texto tangencia algum setor sem ser claramente central).",
    ),
  justification: z.string().describe("Uma frase objetiva explicando a decisão, citando o trecho ou fato que justifica (ou a ausência dele)."),
});

export const SEGMENT_BACKFILL_SYSTEM_PROMPT =
  "Você está classificando o SEGMENTO INDUSTRIAL de notícias já publicadas, para um relatório de auditoria — " +
  "não vai alterar nada no texto. Segmento é o SETOR INDUSTRIAL ao qual a notícia se aplica diretamente, diferente " +
  "de categoria (assunto editorial) e tag (descritor complementar). Associe um segmento somente quando o setor " +
  "tiver relação central ou aplicação industrial diretamente comprovável no fato central da notícia — nunca por " +
  "palavra isolada, nunca por exemplo secundário, nunca só porque uma empresa daquele setor foi citada de " +
  "passagem. Zero, um ou vários segmentos são resultados válidos; lista vazia é o resultado correto e esperado " +
  "quando nenhum setor for central ao fato — nunca preencha segmentos 'por segurança'.";

async function loadIoDeps() {
  const { supabaseAdmin } = await import("../src/lib/supabase");
  const { llm } = await import("../src/lib/agent/llm");
  const { loadValidSegments, filterValidSegmentSlugs, formatSegmentsForPrompt } = await import("../src/lib/agent/taxonomies");
  return { supabaseAdmin, llm, loadValidSegments, filterValidSegmentSlugs, formatSegmentsForPrompt };
}

interface PostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  segment_slugs: string[] | null;
}

/**
 * Logica pura de classificacao — sem I/O, testavel com fixtures (ver
 * backfill-segmentos.test.ts). Recebe o filtro ja aplicado
 * (filterValidSegmentSlugs) e a confianca auto-reportada pelo LLM.
 */
export function classifyBackfillRow(
  filtered: { valid: string[]; rejected: string[] },
  llmConfidence: "alta" | "ambigua",
): BackfillConfidence {
  if (filtered.valid.length === 0) return "NO_SEGMENT";
  if (llmConfidence === "alta" && filtered.rejected.length === 0) return "HIGH_CONFIDENCE";
  return "AMBIGUOUS";
}

function renderReport(rows: BackfillRow[], validSegmentNames: string): string {
  const counts: Record<BackfillConfidence, number> = { HIGH_CONFIDENCE: 0, AMBIGUOUS: 0, NO_SEGMENT: 0, ERROR: 0 };
  for (const row of rows) counts[row.classification] += 1;

  const lines: string[] = [];
  lines.push("# Backfill de Segmentos — Preview (Fase 8B)");
  lines.push("");
  lines.push(`Gerado em ${new Date().toISOString()}. Modo: **DRY-RUN** — nenhuma alteração foi aplicada ao banco.`);
  lines.push("");
  lines.push(`Total de posts avaliados: ${rows.length}.`);
  lines.push("");
  lines.push("## Resumo");
  lines.push("");
  lines.push("| Classificação | Quantidade |");
  lines.push("|---|---|");
  lines.push(`| HIGH_CONFIDENCE | ${counts.HIGH_CONFIDENCE} |`);
  lines.push(`| AMBIGUOUS | ${counts.AMBIGUOUS} |`);
  lines.push(`| NO_SEGMENT | ${counts.NO_SEGMENT} |`);
  lines.push(`| ERROR | ${counts.ERROR} |`);
  lines.push("");
  lines.push(`Segmentos válidos considerados: ${validSegmentNames}.`);
  lines.push("");
  lines.push("## Detalhe por post");
  lines.push("");
  for (const row of rows) {
    lines.push(`### ${row.title}`);
    lines.push("");
    lines.push(`- id: \`${row.id}\` · slug: \`${row.slug}\``);
    lines.push(`- classificação: **${row.classification}**`);
    lines.push(`- segmentos propostos (validados): ${row.segmentSlugsProposed.length ? row.segmentSlugsProposed.join(", ") : "(nenhum)"}`);
    if (row.segmentSlugsRejected.length) lines.push(`- segmentos descartados (slug inventado pelo LLM, ignorado): ${row.segmentSlugsRejected.join(", ")}`);
    if (row.llmConfidence) lines.push(`- confiança reportada pelo classificador: ${row.llmConfidence}`);
    if (row.justification) lines.push(`- justificativa: ${row.justification}`);
    if (row.error) lines.push(`- erro: ${row.error}`);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push(
    "Este relatório é somente leitura. Nenhum post teve texto, categoria, tags ou companies alterados. " +
      "Aplicar este backfill em produção requer uma fase futura dedicada, com revisão humana deste preview antes " +
      "de qualquer escrita no banco.",
  );
  lines.push("");
  return lines.join("\n");
}

async function main() {
  loadEnvSafely();
  const { supabaseAdmin, llm, loadValidSegments, filterValidSegmentSlugs, formatSegmentsForPrompt } = await loadIoDeps();

  console.log("Modo: DRY-RUN (nenhuma escrita no banco será executada — este script não implementa --apply)");
  console.log(`Destino (só leitura): ${describeDestination(resolveDestination())}\n`);

  const validSegments = await loadValidSegments();
  const segmentsBlock = formatSegmentsForPrompt(validSegments);

  const { data: rows, error } = await supabaseAdmin.from("posts").select("id, title, slug, excerpt, content, segment_slugs");
  if (error) throw new Error(`Falha ao consultar posts: ${error.message}`);
  const postRows = (rows ?? []) as PostRow[];
  console.log(`Posts encontrados: ${postRows.length}\n`);

  const writer = llm.withStructuredOutput(SegmentBackfillSchema);
  const results: BackfillRow[] = [];

  for (const row of postRows) {
    console.log(`> ${row.title} (${row.id})`);
    try {
      const draft = await writer.invoke([
        { role: "system", content: SEGMENT_BACKFILL_SYSTEM_PROMPT },
        {
          role: "user",
          content: `SEGMENTOS VÁLIDOS:\n${segmentsBlock}\n\nTÍTULO:\n${row.title}\n\nEXCERPT:\n${row.excerpt}\n\nCORPO:\n${row.content}`,
        },
      ]);
      const filtered = filterValidSegmentSlugs(draft.segmentSlugs, validSegments);
      const classification = classifyBackfillRow(filtered, draft.confidence);
      results.push({
        id: row.id,
        title: row.title,
        slug: row.slug,
        segmentSlugsProposed: filtered.valid,
        segmentSlugsRejected: filtered.rejected,
        llmConfidence: draft.confidence,
        justification: draft.justification,
        classification,
      });
    } catch (classificationError) {
      results.push({
        id: row.id,
        title: row.title,
        slug: row.slug,
        segmentSlugsProposed: [],
        segmentSlugsRejected: [],
        llmConfidence: null,
        justification: "",
        classification: "ERROR",
        error: classificationError instanceof Error ? classificationError.message : String(classificationError),
      });
    }
  }

  const report = renderReport(results, validSegments.map((segment) => segment.name).join(", "));
  const outPath = path.join(process.cwd(), "docs", "backfill-segmentos-preview-fase8.md");
  await fs.writeFile(outPath, report, "utf8");
  console.log(`\nRelatório escrito em ${outPath}`);

  const counts: Record<BackfillConfidence, number> = { HIGH_CONFIDENCE: 0, AMBIGUOUS: 0, NO_SEGMENT: 0, ERROR: 0 };
  for (const row of results) counts[row.classification] += 1;
  console.log(
    `HIGH_CONFIDENCE: ${counts.HIGH_CONFIDENCE} | AMBIGUOUS: ${counts.AMBIGUOUS} | NO_SEGMENT: ${counts.NO_SEGMENT} | ERROR: ${counts.ERROR}`,
  );
}

if (process.argv[1] && process.argv[1].endsWith("backfill-segmentos.ts")) {
  main().catch((error) => {
    console.error("\nBackfill (dry-run) falhou:", error);
    process.exitCode = 1;
  });
}
