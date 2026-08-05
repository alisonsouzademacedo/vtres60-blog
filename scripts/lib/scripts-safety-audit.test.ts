import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Fechamento da Fase 9B.1 — auditoria automática (não manual/pontual) de
 * todo script em scripts/ que pode escrever em Supabase. Existe para que a
 * proteção não dependa de lembrar de proteger cada script novo manualmente:
 * qualquer script futuro que chame supabaseAdmin com um método de escrita
 * (insert/update/upsert/delete/rpc/storage) e não importe scripts/lib/safe-target
 * falha este teste automaticamente.
 */

const scriptsDir = path.join(process.cwd(), "scripts");
const WRITE_METHOD_PATTERN = /supabaseAdmin[\s\S]{0,400}?\.(insert|update|upsert|delete|rpc)\(/;
const STORAGE_WRITE_PATTERN = /\.storage\s*\.\s*from\([^)]*\)[\s\S]{0,200}?\.(upload|remove|move|copy)\(/;
// Só código executável real: "config(" seguido de "override:true" na mesma
// chamada — nunca casa com um comentário em prosa que apenas MENCIONA o
// padrão perigoso (ex: os comentários que documentam esta própria correção).
const UNSAFE_OVERRIDE_PATTERN = /\bconfig\s*\([\s\S]{0,120}?override\s*:\s*true/;

async function listScriptFiles(): Promise<string[]> {
  const entries = await fs.readdir(scriptsDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (!/\.(ts|mts|js|mjs)$/.test(entry.name)) continue;
    if (entry.name.endsWith(".test.ts")) continue;
    files.push(path.join(scriptsDir, entry.name));
  }
  return files;
}

/** Remove comentários // e /* ...*\/ antes de rodar os padrões de detecção — evita falso positivo em prosa explicativa. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const SAFE_TARGET_IMPORT_PATTERN = /from\s+["']\.\.?\/lib\/safe-target["']/;

describe("auditoria automática — nenhum script de escrita usa dotenv override:true", () => {
  it("nenhum arquivo em scripts/ contém o padrão perigoso que causou o incidente real da Fase 9B.1", async () => {
    const files = await listScriptFiles();
    const offenders: string[] = [];
    for (const file of files) {
      const content = stripComments(await fs.readFile(file, "utf8"));
      if (UNSAFE_OVERRIDE_PATTERN.test(content)) offenders.push(path.basename(file));
    }
    expect(offenders).toEqual([]);
  });
});

describe("auditoria automática — todo script com escrita real no Supabase importa a proteção", () => {
  it("mapeia todos os scripts de escrita e confirma que nenhum está desprotegido", async () => {
    const files = await listScriptFiles();
    const writeScripts: string[] = [];
    const unprotected: string[] = [];

    for (const file of files) {
      const content = await fs.readFile(file, "utf8");
      const isWriteScript = WRITE_METHOD_PATTERN.test(content) || STORAGE_WRITE_PATTERN.test(content);
      if (!isWriteScript) continue;
      writeScripts.push(path.basename(file));
      if (!SAFE_TARGET_IMPORT_PATTERN.test(content)) unprotected.push(path.basename(file));
    }

    // Lista de referência confirmada na auditoria manual do fechamento da
    // Fase 9B.1 (docs/implementacao-fase9b1-supabase-dominios.md) — se um
    // script novo de escrita aparecer aqui sem estar nesta lista, é sinal
    // de que a auditoria automática encontrou algo não revisado ainda, não
    // um falso positivo a ser silenciado.
    const knownWriteScripts = ["migrate-operations-to-supabase.ts", "migrate-to-supabase.ts", "backfill-excerpt-impact.ts", "fase5-dry-run.mts"];
    expect(writeScripts.sort()).toEqual(knownWriteScripts.sort());
    expect(unprotected).toEqual([]);
  });
});
