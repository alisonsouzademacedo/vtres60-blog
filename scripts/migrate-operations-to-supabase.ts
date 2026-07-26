/**
 * Fase 9B.1 — migra companies/radarSignals/intelligenceItems de
 * src/content/*.json para o Supabase (companies, radar_signals, intelligence_items).
 *
 * Uso:
 *   npx tsx scripts/migrate-operations-to-supabase.ts --preview   (padrão; nunca escreve)
 *   npx tsx scripts/migrate-operations-to-supabase.ts --apply     (aplica de verdade)
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
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

config({ path: path.join(process.cwd(), ".env.local"), override: true });

async function loadDeps() {
  const { supabaseAdmin } = await import("../src/lib/supabase");
  const { legacyCompanyUuid } = await import("../src/services/operations/company-legacy-ids");
  return { supabaseAdmin, legacyCompanyUuid };
}

const contentDir = path.join(process.cwd(), "src", "content");

type CompanyJson = {
  id: string; name: string; slug: string; legalName?: string; description: string; sector: string;
  website: string; ticker?: string; tickerSource?: string; active: boolean; featured: boolean;
  createdAt: string; updatedAt: string;
};

async function readJson<T>(file: string): Promise<T[]> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(contentDir, file), "utf8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function companyRow(company: CompanyJson, uuid: string) {
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

async function main() {
  const apply = process.argv.includes("--apply");
  const mode = apply ? "APLICAÇÃO REAL" : "PREVIEW (nenhuma escrita)";
  console.log(`Migração Fase 9B.1 — companies/radarSignals/intelligenceItems — modo: ${mode}\n`);

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
  const plan: { company: CompanyJson; uuid: string; action: "insert" | "update" | "conflict" }[] = [];
  for (const company of companies) {
    const uuid = legacyCompanyUuid(company.id);
    console.log(`  ${company.id} -> ${uuid} -> ${company.slug} -> ${company.name}`);

    const { data: existingBySlug, error } = await supabaseAdmin
      .from("companies")
      .select("id, name, slug, legal_name, description, sector, website, ticker, ticker_source, active, featured")
      .eq("slug", company.slug)
      .maybeSingle();
    if (error) throw new Error(`Falha ao consultar slug "${company.slug}": ${error.message}`);

    if (!existingBySlug) {
      plan.push({ company, uuid, action: "insert" });
    } else if (existingBySlug.id === uuid) {
      plan.push({ company, uuid, action: "update" });
    } else {
      plan.push({ company, uuid, action: "conflict" });
      console.log(`    DIVERGÊNCIA: já existe uma linha com slug "${company.slug}" mas id "${existingBySlug.id}" (esperado: "${uuid}"). Não decidindo sozinho — revisar manualmente.`);
    }
  }

  const conflicts = plan.filter((p) => p.action === "conflict");
  if (conflicts.length > 0) {
    console.log(`\n${conflicts.length} divergência(s) encontrada(s). Abortando sem escrever nada.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nResumo: ${plan.filter((p) => p.action === "insert").length} inserção(ões), ${plan.filter((p) => p.action === "update").length} atualização(ões) (idempotente), 0 duplicata(s).`);

  if (!apply) {
    console.log("\nPreview apenas — nenhuma escrita foi feita. Rode com --apply para aplicar de verdade.");
    return;
  }

  for (const { company, uuid } of plan) {
    const row = companyRow(company, uuid);
    const { error } = await supabaseAdmin.from("companies").upsert(row, { onConflict: "id" });
    if (error) throw new Error(`Falha ao migrar "${company.slug}": ${error.message}`);
    console.log(`  aplicado: ${company.slug} (${uuid})`);
  }
  console.log("\nMigração concluída.");
}

main().catch((error) => {
  console.error("\nMigração falhou:", error);
  process.exitCode = 1;
});
