/**
 * Fase 9B.1 — migra companies/radarSignals/intelligenceItems de
 * src/content/*.json para o Supabase (companies, radar_signals, intelligence_items).
 *
 * Uso:
 *   npx tsx scripts/migrate-operations-to-supabase.ts --preview   (padrão; nunca escreve)
 *   npx tsx scripts/migrate-operations-to-supabase.ts --apply     (aplica de verdade — bloqueado contra
 *                                                                   produção sem --allow-production)
 *   npx tsx scripts/migrate-operations-to-supabase.ts --apply --allow-production   (única forma de
 *                                                                   aplicar contra o projeto de produção)
 *
 * radarSignals.json e intelligenceItems.json normalmente não existem (0
 * registros reais até a Fase 9B.1) — tratado como "nada a migrar", não como
 * erro.
 *
 * companies.json tem 6 registros reais com ids legados no formato
 * "company-<slug>", incompatíveis com a coluna companies.id (uuid). Ver
 * decisão registrada em docs/implementacao-fase9b1-supabase-dominios.md:
 * cada id legado vira um UUID v5 determinístico (mesma entrada -> sempre o
 * mesmo UUID, para sempre — src/services/operations/company-legacy-ids.ts).
 *
 * Idempotência: o script NUNCA confia só no UUID. Para cada empresa,
 * verifica primeiro se já existe uma linha com o mesmo slug:
 *   - não existe linha com esse slug -> insere com o UUID determinístico.
 *   - existe linha com esse slug E o id bate com o UUID determinístico
 *     esperado -> já migrada, apenas atualiza campos (nunca cria duplicata).
 *   - existe linha com esse slug mas o id NÃO bate com o esperado -> pára e
 *     reporta a divergência (não decide sozinho, não sobrescreve).
 *
 * PROTEÇÃO DE DESTINO (fechamento da Fase 9B.1): este script NUNCA usa
 * `dotenv.config({override:true})` — variáveis já presentes no processo
 * nunca são silenciosamente sobrescritas por .env.local, e um conflito real
 * entre os dois aborta a execução (ver scripts/lib/safe-target.ts). Toda
 * escrita real (--apply) exige destino identificado, manifest e, contra o
 * project ref de produção confirmado, a flag explícita --allow-production.
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
  const { legacyCompanyUuid } = await import("../src/services/operations/company-legacy-ids");
  return { supabaseAdmin, legacyCompanyUuid };
}

const contentDir = path.join(process.cwd(), "src", "content");

export type CompanyJson = {
  id: string; name: string; slug: string; legalName?: string; description: string; sector: string;
  website: string; ticker?: string; tickerSource?: string; active: boolean; featured: boolean;
  createdAt: string; updatedAt: string;
};

export type PlanAction = "insert" | "update" | "conflict";
export interface PlanEntry { company: CompanyJson; uuid: string; action: PlanAction }

async function readJson<T>(file: string): Promise<T[]> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(contentDir, file), "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function companyRow(company: CompanyJson, uuid: string) {
  return {
    id: uuid,
    name: company.name,
    slug: company.slug,
    legal_name: company.legalName ?? null,
    description: company.description,
    sector: company.sector,
    website: company.website,
    ticker: company.ticker ?? null,
    ticker_source: company.tickerSource ?? null,
    active: company.active,
    featured: company.featured,
    created_at: company.createdAt,
    updated_at: company.updatedAt,
  };
}

// Duck-typing deliberadamente solto (nunca o tipo genérico completo do
// SupabaseClient real, que causa "Type instantiation is excessively deep"
// aqui) — mesma abordagem pragmática de scripts/migrate-to-supabase.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any };

/** Lê o estado real e monta o plano de migração — nunca escreve (mesma função usada em preview e apply). */
export async function buildPlan(supabaseAdmin: SupabaseLike, legacyCompanyUuid: (id: string) => string, companies: CompanyJson[]): Promise<PlanEntry[]> {
  const plan: PlanEntry[] = [];
  for (const company of companies) {
    const uuid = legacyCompanyUuid(company.id);
    const { data: existingBySlug, error } = await supabaseAdmin.from("companies").select("id").eq("slug", company.slug).maybeSingle();
    if (error) throw new Error(`Falha ao consultar slug "${company.slug}": ${error.message}`);
    if (!existingBySlug) plan.push({ company, uuid, action: "insert" });
    else if (existingBySlug.id === uuid) plan.push({ company, uuid, action: "update" });
    else plan.push({ company, uuid, action: "conflict" });
  }
  return plan;
}

/** Só chamada depois de assertSafeToWrite — nunca no caminho de preview/dry-run. */
export async function applyPlan(supabaseAdmin: SupabaseLike, plan: PlanEntry[]): Promise<void> {
  for (const { company, uuid } of plan) {
    const row = companyRow(company, uuid);
    const { error } = await supabaseAdmin.from("companies").upsert(row, { onConflict: "id" });
    if (error) throw new Error(`Falha ao migrar "${company.slug}": ${error.message}`);
    console.log(`  aplicado: ${company.slug} (${uuid})`);
  }
}

async function main() {
  loadEnvSafely();

  const apply = process.argv.includes("--apply");
  const allowProduction = process.argv.includes("--allow-production");
  const mode = apply ? "APLICAÇÃO REAL" : "PREVIEW (nenhuma escrita)";
  console.log(`Migração Fase 9B.1 — companies/radarSignals/intelligenceItems — modo: ${mode}`);

  const destination: ResolvedDestination = resolveDestination();
  console.log(`Destino: ${describeDestination(destination)}\n`);

  const { supabaseAdmin, legacyCompanyUuid } = await loadDeps();

  // --- radarSignals / intelligenceItems: confirmar estado vazio, não inventar dado ---
  for (const [file, table] of [["radarSignals.json", "radar_signals"], ["intelligenceItems.json", "intelligence_items"]] as const) {
    const records = await readJson(file);
    console.log(`> ${file} -> ${table}: ${records.length} registro(s) reais encontrados.`);
    if (records.length > 0) {
      console.log(`  AVISO: registros reais encontrados em ${file} — este script não migra Radar/Inteligência ainda (fora do escopo mapeado na auditoria da Fase 9B.1, que confirmou 0 registros). Pare e reavalie antes de prosseguir.`);
      process.exitCode = 1;
      return;
    }
    console.log("  (vazio — nada a migrar, confirma o estado honesto já documentado)");
  }
  console.log();

  // --- companies: migração real com mapeamento determinístico ---
  const companies = await readJson<CompanyJson>("companies.json");
  console.log(`> companies.json: ${companies.length} registro(s) reais encontrados.\n`);

  console.log("Mapa legacy_id -> uuid -> slug -> name:");
  for (const company of companies) console.log(`  ${company.id} -> ${legacyCompanyUuid(company.id)} -> ${company.slug} -> ${company.name}`);
  console.log();

  const plan = await buildPlan(supabaseAdmin, legacyCompanyUuid, companies);
  for (const entry of plan) {
    if (entry.action === "conflict") {
      console.log(`  DIVERGÊNCIA: já existe uma linha com slug "${entry.company.slug}" com id diferente do esperado ("${entry.uuid}"). Não decidindo sozinho — revisar manualmente.`);
    }
  }

  const conflicts = plan.filter((p) => p.action === "conflict");
  if (conflicts.length > 0) {
    console.log(`\n${conflicts.length} divergência(s) encontrada(s). Abortando sem escrever nada.`);
    process.exitCode = 1;
    return;
  }

  const inserts = plan.filter((p) => p.action === "insert").length;
  const updates = plan.filter((p) => p.action === "update").length;
  console.log(`\nResumo: ${inserts} inserção(ões), ${updates} atualização(ões) (idempotente), 0 duplicata(s).`);

  const manifest = buildManifest({
    script: "migrate-operations-to-supabase.ts",
    destination,
    mode: apply ? "apply" : "dry-run",
    entities: "companies",
    quantity: plan.length,
    ids: plan.map((p) => p.uuid),
    rollbackPlan: `delete from public.companies where id in (${plan.map((p) => `'${p.uuid}'`).join(", ")});`,
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

  await applyPlan(supabaseAdmin, plan);
  console.log("\nMigração concluída.");
}

if (process.argv[1] && process.argv[1].endsWith("migrate-operations-to-supabase.ts")) {
  main().catch((error) => {
    console.error("\nMigração falhou:", error);
    process.exitCode = 1;
  });
}
