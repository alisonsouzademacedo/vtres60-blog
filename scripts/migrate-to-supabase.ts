/**
 * Migra o conteudo editorial de src/content/*.json para as tabelas do Supabase
 * criadas por supabase-schema.sql.
 *
 * Uso:
 *   npx tsx scripts/migrate-to-supabase.ts                                (preview; padrão; nunca escreve)
 *   npx tsx scripts/migrate-to-supabase.ts --apply                       (aplica de verdade)
 *   npx tsx scripts/migrate-to-supabase.ts --apply --allow-production    (única forma de aplicar contra produção)
 *
 * Preserva o `id`, `createdAt` e `updatedAt` originais de cada registro (usa
 * upsert por id, entao rodar de novo e seguro / idempotente).
 *
 * PROTEÇÃO DE DESTINO (fechamento da Fase 9B.1, docs/implementacao-fase9b1-supabase-dominios.md):
 * este script passou a operar em dry-run por padrão — antes, escrevia
 * incondicionalmente, sem nenhuma flag --apply, o que teria o mesmo risco
 * que causou o incidente real de escrita acidental em produção durante a
 * validação da Fase 9B.1. Nunca usa `dotenv.config({override:true})` — ver
 * scripts/lib/safe-target.ts.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  assertSafeToWrite,
  buildManifest,
  describeDestination,
  loadEnvSafely,
  printManifest,
  resolveDestination,
  writeManifest,
  type ResolvedDestination,
} from "./lib/safe-target";

async function loadDeps() {
  const { supabaseAdmin } = await import("../src/lib/supabase");
  const { EDITORIAL_TABLES, editorialMappers } = await import("../src/services/editorial/editorial-repository");
  return { supabaseAdmin, EDITORIAL_TABLES, editorialMappers };
}

const contentDir = path.join(process.cwd(), "src", "content");

// Colecoes referenciadas (categories, authors, tags) migram antes das que
// as referenciam (posts, educational-articles) — nao ha FK no banco, mas
// mantem a ordem logica caso constraints sejam adicionadas no futuro.
const COLLECTIONS = ["authors", "categories", "tags", "posts", "educational-articles"] as const;

interface CollectionPlan {
  collection: (typeof COLLECTIONS)[number];
  table: string;
  records: unknown[];
  rows: Record<string, unknown>[];
  ids: string[];
}

/** Só lê os JSONs e monta o plano — nunca escreve. Mesma função usada em preview e apply. */
export async function buildPlan(
  editorialMappers: Record<string, { toRow: (record: never) => Record<string, unknown> }>,
  editorialTables: Record<string, string>,
  baseContentDir: string = contentDir,
): Promise<CollectionPlan[]> {
  const plans: CollectionPlan[] = [];
  for (const collection of COLLECTIONS) {
    const file = path.join(baseContentDir, `${collection}.json`);
    let records: unknown[];
    try {
      records = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      records = [];
    }
    if (!Array.isArray(records)) records = [];
    const mapper = editorialMappers[collection];
    const rows = records.map((record) => mapper.toRow(record as never));
    const ids = rows.map((row) => String(row.id ?? ""));
    plans.push({ collection, table: editorialTables[collection], records, rows, ids });
  }
  return plans;
}

// Duck-typing deliberadamente solto (nunca o tipo genérico completo do
// SupabaseClient real, que causa "Type instantiation is excessively deep").
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any };

/** Só chamada depois de assertSafeToWrite — nunca no caminho de preview/dry-run. */
export async function applyPlan(supabaseAdmin: SupabaseLike, plans: CollectionPlan[]): Promise<void> {
  for (const plan of plans) {
    if (plan.rows.length === 0) continue;
    const { error } = await supabaseAdmin.from(plan.table).upsert(plan.rows, { onConflict: "id" });
    if (error) throw new Error(`Falha ao migrar "${plan.collection}": ${error.message}`);
    console.log(`  ${plan.records.length} registro(s) migrado(s) para "${plan.table}".`);
  }
}

async function main() {
  loadEnvSafely();

  const apply = process.argv.includes("--apply");
  const allowProduction = process.argv.includes("--allow-production");
  console.log(`Migração de conteúdo editorial — modo: ${apply ? "APLICAÇÃO REAL" : "PREVIEW (nenhuma escrita)"}`);

  const destination: ResolvedDestination = resolveDestination();
  console.log(`Destino: ${describeDestination(destination)}\n`);

  const { supabaseAdmin, EDITORIAL_TABLES, editorialMappers } = await loadDeps();
  const plans = await buildPlan(editorialMappers, EDITORIAL_TABLES);

  for (const plan of plans) {
    console.log(`> ${plan.collection}`);
    if (plan.records.length === 0) {
      console.log(`  (${plan.collection}.json vazio ou ausente — pulando)`);
      continue;
    }
    console.log(`  ${plan.records.length} registro(s) encontrado(s) — destino: "${plan.table}"`);
  }

  const totalRecords = plans.reduce((sum, plan) => sum + plan.records.length, 0);
  const allIds = plans.flatMap((plan) => plan.ids);
  const manifest = buildManifest({
    script: "migrate-to-supabase.ts",
    destination,
    mode: apply ? "apply" : "dry-run",
    entities: plans.filter((plan) => plan.records.length > 0).map((plan) => plan.collection).join(","),
    quantity: totalRecords,
    ids: allIds,
    rollbackPlan: "upsert por id preserva o registro anterior apenas se restaurado de um backup externo — este script não gera backup automático; usar exportBackup()/backup-service.ts antes de aplicar em produção.",
  });
  printManifest(manifest);
  const manifestPath = await writeManifest(manifest);
  console.log(`Manifest gravado em ${manifestPath} (fora do controle de versão).`);

  if (!apply) {
    console.log("\nPreview apenas — nenhuma escrita foi feita. Rode com --apply para aplicar de verdade.");
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

  console.log("\nAplicando...\n");
  await applyPlan(supabaseAdmin, plans);
  console.log("\nMigracao concluida.");
}

if (process.argv[1] && process.argv[1].endsWith("migrate-to-supabase.ts")) {
  main().catch((error) => {
    console.error("\nMigracao falhou:", error);
    process.exitCode = 1;
  });
}
