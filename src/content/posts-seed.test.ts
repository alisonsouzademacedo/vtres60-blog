import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Trava de regressão da Fase 1: impede que os 9 posts artificiais do lote de
// lançamento (27-28/06/2026) voltem a existir em src/content/posts.json, o
// que faria scripts/migrate-to-supabase.ts recriá-los no Supabase (upsert por
// id) numa próxima execução. Ver docs/backup-fase1-remocoes-2026-07-09.json
// para o backup completo dos registros removidos.
const REMOVED_SEED_IDS = [
  "post-automacao-industrial-muda-produtividade-fabricas-brasileiras",
  "post-industria-do-aco-preve-novo-ciclo-de-demanda",
  "post-logistica-industrial-ganha-eficiencia-com-dados",
  "post-ia-generativa-chega-ao-comercial-b2b-industrial",
  "post-exportacoes-de-maquinas-abrem-novas-rotas",
  "post-crm-industrial-deixa-de-ser-agenda-de-contatos",
  "post-conteudo-tecnico-gera-demanda-b2b-industria",
  "post-marketing-digital-industrial-fabricas-medio-porte",
  "post-seo-industrial-canal-estrategico-empresas-b2b",
];

const REMOVED_SEED_TITLES = [
  "Automação avança e redefine a produtividade das fábricas brasileiras",
  "Indústria do aço prevê novo ciclo de demanda puxado por infraestrutura",
  "Logística industrial ganha eficiência com decisões orientadas por dados",
  "IA generativa chega ao comercial B2B — e muda a preparação de propostas",
  "Exportações de máquinas abrem novas rotas para fabricantes nacionais",
  "CRM industrial deixa de ser agenda e passa a orientar a demanda",
  "Como indústrias estão usando conteúdo técnico para gerar demanda B2B",
  "Marketing digital industrial ganha força em fábricas de médio porte",
  "SEO industrial se torna canal estratégico para empresas B2B",
];

describe("src/content/posts.json — lote artificial removido", () => {
  const raw = readFileSync(path.join(__dirname, "posts.json"), "utf8");
  const records = JSON.parse(raw) as Array<{ id: string; title: string }>;

  it("continua sendo um JSON válido", () => {
    expect(Array.isArray(records)).toBe(true);
  });

  it("não contém nenhum dos 9 IDs do lote artificial", () => {
    const ids = records.map((r) => r.id);
    for (const removedId of REMOVED_SEED_IDS) {
      expect(ids).not.toContain(removedId);
    }
  });

  it("não contém nenhum dos 9 títulos do lote artificial", () => {
    const titles = records.map((r) => r.title);
    for (const removedTitle of REMOVED_SEED_TITLES) {
      expect(titles).not.toContain(removedTitle);
    }
  });

  it("está vazio hoje — scripts/migrate-to-supabase.ts não tem fonte para recriar os 9 posts a partir deste arquivo", () => {
    // migrate-to-supabase.ts faz upsert de records lidos diretamente deste
    // arquivo (COLLECTIONS = [...,"posts",...]); um array vazio (ou sem os
    // ids acima) não pode recriar os registros removidos.
    expect(records.length).toBe(0);
  });
});
