import { describe, expect, it, vi, type Mock } from "vitest";
import { applyPlan, buildPlan, companyRow, type CompanyJson } from "./migrate-operations-to-supabase";
import { assertSafeToWrite, ProductionGuardError, type ResolvedDestination } from "./lib/safe-target";

function company(overrides: Partial<CompanyJson> = {}): CompanyJson {
  return {
    id: "company-weg", name: "WEG", slug: "weg", description: "d", sector: "s", website: "https://weg.net",
    active: true, featured: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSupabaseMock(existingBySlug: Record<string, { id: string } | null>) {
  const selectEqMaybeSingle = vi.fn(async (slug: string) => ({ data: existingBySlug[slug] ?? null, error: null }));
  const upsert: Mock<(row: Record<string, unknown>, opts: { onConflict: string }) => Promise<{ error: null }>> = vi
    .fn()
    .mockResolvedValue({ error: null });
  const supabaseAdmin = {
    from: () => ({
      select: () => ({ eq: (_column: string, value: string) => ({ maybeSingle: () => selectEqMaybeSingle(value) }) }),
      upsert,
    }),
  };
  return { supabaseAdmin, upsert, selectEqMaybeSingle };
}

const legacyCompanyUuid = (id: string) => `uuid-for-${id}`;

describe("companyRow", () => {
  it("mapeia camelCase para snake_case preservando o uuid determinístico fornecido", () => {
    const row = companyRow(company(), "19cdc9a5-89f3-5532-943c-91f7cfc215db");
    expect(row).toMatchObject({ id: "19cdc9a5-89f3-5532-943c-91f7cfc215db", name: "WEG", slug: "weg", legal_name: null, ticker: null, ticker_source: null });
  });
});

describe("buildPlan (caminho usado tanto no preview quanto no apply — nunca escreve)", () => {
  it("classifica como 'insert' quando não existe linha com o slug", async () => {
    const { supabaseAdmin, upsert } = makeSupabaseMock({});
    const plan = await buildPlan(supabaseAdmin, legacyCompanyUuid, [company()]);
    expect(plan).toEqual([{ company: company(), uuid: "uuid-for-company-weg", action: "insert" }]);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("classifica como 'update' quando a linha existente já tem o uuid determinístico esperado", async () => {
    const { supabaseAdmin, upsert } = makeSupabaseMock({ weg: { id: "uuid-for-company-weg" } });
    const plan = await buildPlan(supabaseAdmin, legacyCompanyUuid, [company()]);
    expect(plan[0].action).toBe("update");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("classifica como 'conflict' quando a linha existente tem um id DIFERENTE do uuid determinístico esperado — nunca decide sozinho", async () => {
    const { supabaseAdmin, upsert } = makeSupabaseMock({ weg: { id: "algum-outro-uuid" } });
    const plan = await buildPlan(supabaseAdmin, legacyCompanyUuid, [company()]);
    expect(plan[0].action).toBe("conflict");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("prova que o caminho de preview/dry-run nunca chama upsert (nenhuma mutação), mesmo com múltiplas empresas", async () => {
    const { supabaseAdmin, upsert, selectEqMaybeSingle } = makeSupabaseMock({});
    await buildPlan(supabaseAdmin, legacyCompanyUuid, [company({ slug: "weg" }), company({ id: "company-gerdau", slug: "gerdau" })]);
    expect(selectEqMaybeSingle).toHaveBeenCalledTimes(2);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("applyPlan (só deve ser chamado depois de assertSafeToWrite passar)", () => {
  it("chama upsert uma vez por entrada do plano, com o uuid determinístico correto", async () => {
    const { supabaseAdmin, upsert } = makeSupabaseMock({});
    await applyPlan(supabaseAdmin, [{ company: company(), uuid: "19cdc9a5-89f3-5532-943c-91f7cfc215db", action: "insert" }]);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "19cdc9a5-89f3-5532-943c-91f7cfc215db", slug: "weg" }), { onConflict: "id" });
  });

  it("aplicar o mesmo plano duas vezes é idempotente (upsert por id, sem duplicar)", async () => {
    const { supabaseAdmin, upsert } = makeSupabaseMock({});
    const plan = [{ company: company(), uuid: "19cdc9a5-89f3-5532-943c-91f7cfc215db", action: "insert" as const }];
    await applyPlan(supabaseAdmin, plan);
    await applyPlan(supabaseAdmin, plan);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0]).toEqual(upsert.mock.calls[1][0]);
  });
});

describe("escrita bloqueada nunca chama Supabase", () => {
  const productionDestination: ResolvedDestination = { kind: "PRODUCTION", hostname: "fdsojpwznvephwdoghbn.supabase.co", port: "443", projectRef: "fdsojpwznvephwdoghbn" };

  /** Replica a ordem exata de main(): assertSafeToWrite ANTES de applyPlan — nunca o inverso. */
  async function runGuardedApply(supabaseAdmin: Parameters<typeof applyPlan>[0], plan: Parameters<typeof applyPlan>[1]) {
    assertSafeToWrite(productionDestination, { allowProduction: false, apply: true, dryRun: false, manifestGenerated: true, idempotencyKey: "abc", actor: "pedro" });
    await applyPlan(supabaseAdmin, plan);
  }

  it("quando assertSafeToWrite lança (produção sem --allow-production), applyPlan nunca chega a ser chamado — upsert real nunca acontece", async () => {
    const { supabaseAdmin, upsert } = makeSupabaseMock({});
    const plan = [{ company: company(), uuid: "19cdc9a5-89f3-5532-943c-91f7cfc215db", action: "insert" as const }];
    await expect(runGuardedApply(supabaseAdmin, plan)).rejects.toBeInstanceOf(ProductionGuardError);
    expect(upsert).not.toHaveBeenCalled();
  });
});
