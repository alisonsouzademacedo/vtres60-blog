/**
 * Migra o conteudo editorial de src/content/*.json para as tabelas do Supabase
 * criadas por supabase-schema.sql.
 *
 * Uso: npm run migrate
 *
 * Preserva o `id`, `createdAt` e `updatedAt` originais de cada registro (usa
 * upsert por id, entao rodar de novo e seguro / idempotente).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

// override: true — este ambiente pode ja ter SUPABASE_* definidas
// globalmente (de outra ferramenta/projeto); sem isso, dotenv preserva
// a env var pre-existente em vez do valor de .env.local.
config({ path: path.join(process.cwd(), ".env.local"), override: true });

// Import dinamico e proposital: precisa rodar DEPOIS do config() acima.
// Um `import` estatico no topo do arquivo seria avaliado antes deste
// config(), porque o carregamento de modulos e resolvido antes do corpo
// do script rodar — src/lib/supabase.ts leria as env vars como undefined.
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

async function main() {
  const { supabaseAdmin, EDITORIAL_TABLES, editorialMappers } = await loadDeps();

  console.log("Migrando conteudo editorial de src/content/*.json para o Supabase...\n");

  for (const collection of COLLECTIONS) {
    console.log(`> ${collection}`);
    const file = path.join(contentDir, `${collection}.json`);
    let records: unknown[];
    try {
      records = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      console.log(`  (nenhum arquivo ${collection}.json encontrado — pulando)`);
      continue;
    }
    if (!Array.isArray(records) || records.length === 0) {
      console.log(`  (${collection}.json vazio — pulando)`);
      continue;
    }

    const mapper = editorialMappers[collection];
    const rows = records.map((record) => mapper.toRow(record as never));

    const { error } = await supabaseAdmin.from(EDITORIAL_TABLES[collection]).upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`Falha ao migrar "${collection}": ${error.message}`);
    console.log(`  ${records.length} registro(s) migrado(s) para "${EDITORIAL_TABLES[collection]}".`);
  }

  console.log("\nMigracao concluida.");
}

main().catch((error) => {
  console.error("\nMigracao falhou:", error);
  process.exitCode = 1;
});
