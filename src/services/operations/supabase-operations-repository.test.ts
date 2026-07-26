import { beforeEach, describe, expect, it, vi } from "vitest";
import { legacyCompanyUuid } from "./company-legacy-ids";

type Row = Record<string, unknown>;

const state = {
  selectResult: { data: [] as Row[], error: null as { code?: string; message: string } | null },
  singleResult: { data: null as Row | null, error: null as { code?: string; message: string } | null },
  insertResult: { data: null as Row | null, error: null as { code?: string; message: string } | null },
  updateResult: { data: null as Row | null, error: null as { code?: string; message: string } | null },
  deleteResult: { data: null as Row[] | null, error: null as { code?: string; message: string } | null },
  updateInResult: { error: null as { message: string } | null },
};

const calls = {
  eqArgs: [] as unknown[][],
  insertArgs: [] as unknown[][],
  updateArgs: [] as unknown[][],
  deleteEqArgs: [] as unknown[][],
  inArgs: [] as unknown[][],
  fromArgs: [] as unknown[][],
};

function resetMocks() {
  state.selectResult = { data: [], error: null };
  state.singleResult = { data: null, error: null };
  state.insertResult = { data: null, error: null };
  state.updateResult = { data: null, error: null };
  state.deleteResult = { data: [], error: null };
  state.updateInResult = { error: null };
  calls.eqArgs = [];
  calls.insertArgs = [];
  calls.updateArgs = [];
  calls.deleteEqArgs = [];
  calls.inArgs = [];
  calls.fromArgs = [];
}

function chain() {
  return {
    select: (...selectArgs: unknown[]) => {
      // list(): select("*").order(...)
      // create/update-after-insert: select().single()/select().maybeSingle()
      // delete: select("id")
      return {
        order: async () => state.selectResult,
        single: async () => state.insertResult,
        maybeSingle: async () => (selectArgs.length ? state.deleteResult /* unused */ : state.singleResult),
        eq: (...eqArgs: unknown[]) => {
          calls.eqArgs.push(eqArgs);
          return { maybeSingle: async () => state.singleResult };
        },
      };
    },
    insert: (...args: unknown[]) => {
      calls.insertArgs.push(args);
      return { select: () => ({ single: async () => state.insertResult }) };
    },
    update: (...args: unknown[]) => {
      calls.updateArgs.push(args);
      return {
        eq: (...eqArgs: unknown[]) => {
          calls.eqArgs.push(eqArgs);
          return { select: () => ({ maybeSingle: async () => state.updateResult }) };
        },
        in: (...inArgs: unknown[]) => {
          calls.inArgs.push(inArgs);
          return Promise.resolve(state.updateInResult);
        },
      };
    },
    delete: () => ({
      eq: (...args: unknown[]) => {
        calls.deleteEqArgs.push(args);
        return { select: async () => state.deleteResult };
      },
    }),
  };
}

function defaultFrom(...args: unknown[]) {
  calls.fromArgs.push(args);
  return chain();
}

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: vi.fn(defaultFrom) },
}));

import { supabaseAdmin } from "@/lib/supabase";
import { supabaseOperationsRepository } from "./supabase-operations-repository";

beforeEach(() => {
  resetMocks();
  // Alguns testes sobrescrevem from() com mockImplementation() para simular
  // múltiplas chamadas eq() com respostas diferentes — restaura o padrão
  // aqui para que essa sobrescrita nunca vaze para o próximo teste.
  vi.mocked(supabaseAdmin.from).mockReset();
  vi.mocked(supabaseAdmin.from).mockImplementation(defaultFrom as never);
});

describe("supabaseOperationsRepository — companies", () => {
  it("listCompanies consulta a tabela 'companies' e mapeia snake_case -> camelCase", async () => {
    state.selectResult = {
      data: [{ id: "u1", name: "WEG", slug: "weg", legal_name: null, description: "d", sector: "s", website: "https://weg.net", ticker: "WEGE3", ticker_source: "t", active: true, featured: false, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }],
      error: null,
    };
    const result = await supabaseOperationsRepository.listCompanies();
    expect(calls.fromArgs[0]).toEqual(["companies"]);
    expect(result).toEqual([{ id: "u1", name: "WEG", slug: "weg", description: "d", sector: "s", website: "https://weg.net", ticker: "WEGE3", tickerSource: "t", active: true, featured: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }]);
  });

  it("getCompany resolve por id real primeiro", async () => {
    state.singleResult = { data: { id: "u1", name: "WEG", slug: "weg", description: "d", sector: "s", website: "w", active: true, featured: false, created_at: "c", updated_at: "u" }, error: null };
    const result = await supabaseOperationsRepository.getCompany("u1");
    expect(result?.name).toBe("WEG");
  });

  it("getCompany cai para busca por slug quando o id não bate", async () => {
    const eqColumns: string[] = [];
    const supa = await import("@/lib/supabase");
    vi.mocked(supa.supabaseAdmin.from).mockImplementation(() => ({
      select: () => ({
        eq: (column: string, value: string) => {
          eqColumns.push(column);
          return {
            maybeSingle: async () => {
              if (column === "slug" && value === "weg") {
                return { data: { id: "u1", name: "WEG", slug: "weg", description: "d", sector: "s", website: "w", active: true, featured: false, created_at: "c", updated_at: "u" }, error: null };
              }
              return { data: null, error: null };
            },
          };
        },
        order: async () => ({ data: [], error: null }),
      }),
    }) as never);
    const result = await supabaseOperationsRepository.getCompany("weg");
    expect(result?.slug).toBe("weg");
    expect(eqColumns).toEqual(["id", "slug"]);
  });

  it("getCompany resolve id legado (company-weg) para o UUID determinístico correspondente", async () => {
    const expectedUuid = legacyCompanyUuid("company-weg");
    // simula: by-id falha, by-slug falha, resolução por legado encontra
    let attempt = 0;
    const supa = await import("@/lib/supabase");
    vi.mocked(supa.supabaseAdmin.from).mockImplementation(() => ({
      select: () => ({
        eq: (_col: string, value: string) => {
          attempt++;
          return {
            maybeSingle: async () => {
              if (value === expectedUuid) return { data: { id: expectedUuid, name: "WEG", slug: "weg", description: "d", sector: "s", website: "w", active: true, featured: false, created_at: "c", updated_at: "u" }, error: null };
              return { data: null, error: null };
            },
          };
        },
        order: async () => ({ data: [], error: null }),
      }),
    }) as never);
    const result = await supabaseOperationsRepository.getCompany("company-weg");
    expect(result?.id).toBe(expectedUuid);
    expect(attempt).toBeGreaterThanOrEqual(2);
  });

  it("getCompany não lança quando o id legado é sintaticamente inválido para uuid (22P02 real do Postgres) — cai para slug/legado em vez de propagar o erro (bug real encontrado via Playwright manual em /admin/empresas/company-weg)", async () => {
    const expectedUuid = legacyCompanyUuid("company-weg");
    const supa = await import("@/lib/supabase");
    vi.mocked(supa.supabaseAdmin.from).mockImplementation(() => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            if (column === "id" && value === "company-weg") {
              // Erro real do Postgres quando "company-weg" é usado contra uma coluna uuid.
              return { data: null, error: { code: "22P02", message: 'invalid input syntax for type uuid: "company-weg"' } };
            }
            if (column === "id" && value === expectedUuid) {
              return { data: { id: expectedUuid, name: "WEG", slug: "weg", description: "d", sector: "s", website: "w", active: true, featured: false, created_at: "c", updated_at: "u" }, error: null };
            }
            return { data: null, error: null };
          },
        }),
        order: async () => ({ data: [], error: null }),
      }),
    }) as never);
    const result = await supabaseOperationsRepository.getCompany("company-weg");
    expect(result?.id).toBe(expectedUuid);
  });

  it("getCompany propaga um erro real (não 22P02) na busca por id em vez de engolir silenciosamente", async () => {
    const supa = await import("@/lib/supabase");
    vi.mocked(supa.supabaseAdmin.from).mockImplementation(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: "500", message: "conexão falhou" } }) }),
        order: async () => ({ data: [], error: null }),
      }),
    }) as never);
    await expect(supabaseOperationsRepository.getCompany("qualquer-id")).rejects.toThrow("conexão falhou");
  });

  it("createCompany traduz violação de unicidade (23505) para a mensagem de slug duplicado", async () => {
    state.insertResult = { data: null, error: { code: "23505", message: "duplicate key" } };
    await expect(
      supabaseOperationsRepository.createCompany({ name: "X", slug: "weg", description: "d", sector: "s", website: "w", active: true, featured: false }),
    ).rejects.toThrow("Este slug já está em uso.");
  });

  it("createCompany insere com um UUID novo (não determinístico) para empresas novas", async () => {
    state.insertResult = { data: { id: "generated", name: "X", slug: "x", description: "d", sector: "s", website: "w", active: true, featured: false, created_at: "c", updated_at: "u" }, error: null };
    await supabaseOperationsRepository.createCompany({ name: "X", slug: "x", description: "d", sector: "s", website: "w", active: true, featured: false });
    const insertedRow = calls.insertArgs[0][0] as Row;
    expect(typeof insertedRow.id).toBe("string");
    expect((insertedRow.id as string).length).toBe(36);
  });

  it("deleteCompany retorna true quando uma linha foi de fato removida", async () => {
    state.deleteResult = { data: [{ id: "u1" }], error: null };
    await expect(supabaseOperationsRepository.deleteCompany("u1")).resolves.toBe(true);
  });

  it("deleteCompany retorna false quando nenhuma linha existia", async () => {
    state.deleteResult = { data: [], error: null };
    await expect(supabaseOperationsRepository.deleteCompany("inexistente")).resolves.toBe(false);
  });
});

describe("supabaseOperationsRepository — radarSignals / intelligenceItems", () => {
  it("listRadarSignals consulta a tabela 'radar_signals'", async () => {
    state.selectResult = { data: [], error: null };
    await supabaseOperationsRepository.listRadarSignals();
    expect(calls.fromArgs[0]).toEqual(["radar_signals"]);
  });

  it("listIntelligenceItems consulta a tabela 'intelligence_items'", async () => {
    state.selectResult = { data: [], error: null };
    await supabaseOperationsRepository.listIntelligenceItems();
    expect(calls.fromArgs[0]).toEqual(["intelligence_items"]);
  });

  it("sweepExpiry marca como 'expired' (via update().in()) um sinal publicado cuja validUntil já passou", async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    state.selectResult = {
      data: [{ id: "s1", title: "T", summary: "S", evidence_post_ids: [], source_urls: [], tag_ids: [], segment_slugs: [], company_slugs: [], confidence: "alta", generated_at: "c", valid_until: past, status: "published", created_at: "c", updated_at: "u" }],
      error: null,
    };
    const result = await supabaseOperationsRepository.listRadarSignals();
    expect(result[0].status).toBe("expired");
    expect(calls.inArgs[0]).toEqual(["id", ["s1"]]);
    expect(calls.updateArgs[0][0]).toMatchObject({ status: "expired" });
  });

  it("sweepExpiry não altera um sinal publicado cuja validUntil ainda não passou", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    state.selectResult = {
      data: [{ id: "s1", title: "T", summary: "S", evidence_post_ids: [], source_urls: [], tag_ids: [], segment_slugs: [], company_slugs: [], confidence: "alta", generated_at: "c", valid_until: future, status: "published", created_at: "c", updated_at: "u" }],
      error: null,
    };
    const result = await supabaseOperationsRepository.listRadarSignals();
    expect(result[0].status).toBe("published");
    expect(calls.inArgs.length).toBe(0);
  });

  it("createIntelligenceItem mapeia radarSignalId para a coluna radar_signal_id", async () => {
    state.insertResult = { data: { id: "i1", radar_signal_id: "s1", kind: "fact", title: "T", analysis: "A", evidence_post_ids: [], source_urls: [], segment_slugs: [], company_slugs: [], confidence: "alta", generated_at: "c", valid_until: "v", status: "draft", created_at: "c", updated_at: "u" }, error: null };
    await supabaseOperationsRepository.createIntelligenceItem({ radarSignalId: "s1", kind: "fact", title: "T", analysis: "A", evidencePostIds: [], sourceUrls: [], segmentSlugs: [], companySlugs: [], confidence: "alta", generatedAt: "c", validUntil: "v", status: "draft" });
    const insertedRow = calls.insertArgs[0][0] as Row;
    expect(insertedRow.radar_signal_id).toBe("s1");
  });
});
