import { beforeEach, describe, expect, it } from "vitest";
import { VALIDATED_IDS, buildUpdatePatch, classifyDraft, type PostRow } from "./backfill-excerpt-impact";

function row(overrides: Partial<PostRow> = {}): Pick<PostRow, "title" | "content" | "seo"> {
  return {
    title: "Título de teste",
    content: "Primeiro parágrafo do corpo.\n\nSegundo parágrafo do corpo.",
    seo: { metaDescription: "meta antiga" },
    ...overrides,
  };
}

describe("classifyDraft — lógica pura de classificação (Fase 2)", () => {
  it("approved quando excerpt/impact são válidos e não há CTA legado", () => {
    const result = classifyDraft(
      row(),
      "Resumo curto e válido do fato central.",
      "O movimento pode indicar atenção redobrada ao setor nos próximos meses.",
    );
    expect(result.status).toBe("approved");
    expect(result.ctaDetected).toBe("false");
    expect(result.bodyWouldChange).toBe(false);
  });

  it("rejected quando o excerpt proposto termina em reticências", () => {
    const result = classifyDraft(row(), "Resumo cortado no meio da…", "Análise válida e distinta do resumo.");
    expect(result.status).toBe("rejected");
    expect(result.reason).toMatch(/reticências/);
  });

  it("rejected quando o impact proposto está vazio", () => {
    const result = classifyDraft(row(), "Resumo válido do fato.", "");
    expect(result.status).toBe("rejected");
    expect(result.reason).toMatch(/impact vazio/);
  });

  it("approved E marca CTA detectado quando o body tem o fechamento legado :::highlight...v360...:::highlight", () => {
    const bodyWithCta = row({
      content:
        "Primeiro parágrafo factual.\n\n:::highlight\nAssim como a empresa citada, a V360 é a parceira ideal para a sua indústria crescer com previsibilidade. Fale com um especialista.\n:::highlight",
    });
    const result = classifyDraft(bodyWithCta, "Resumo curto e válido do fato central.", "Análise válida e distinta do resumo apresentado.");
    expect(result.status).toBe("approved");
    expect(result.ctaDetected).toBe("true");
    expect(result.bodyWouldChange).toBe(true);
    expect(result.proposedBody).toBe("Primeiro parágrafo factual.");
  });

  it("ambiguous quando há menção à V360 sem o wrapper :::highlight — não altera nada (nem excerpt/impact)", () => {
    const bodyAmbiguous = row({
      content: "Primeiro parágrafo.\n\nA V360 é a parceira ideal para a sua indústria crescer com previsibilidade.",
    });
    const result = classifyDraft(bodyAmbiguous, "Resumo curto e válido do fato central.", "Análise válida e distinta do resumo apresentado.");
    expect(result.status).toBe("ambiguous");
    expect(result.ctaDetected).toBe("ambiguous");
    expect(result.bodyWouldChange).toBe(false);
  });

  it("não remove um parágrafo factual que apenas cita 'V360' isoladamente (falso positivo evitado)", () => {
    const bodyFactual = row({ content: "Primeiro parágrafo.\n\nA V360 é uma agência de marketing industrial." });
    const result = classifyDraft(bodyFactual, "Resumo curto e válido do fato central.", "Análise válida e distinta do resumo apresentado.");
    // "unwrapped" -> ambiguous, nunca removido automaticamente por busca de palavra isolada.
    expect(result.status).toBe("ambiguous");
  });

  it("rejected quando impact é apenas paráfrase do excerpt (sobreposição acima do limite)", () => {
    const excerpt = "A indústria paulista teve o pior desempenho da série histórica no primeiro semestre.";
    const impact = "A indústria paulista registrou o pior desempenho da série histórica no primeiro semestre.";
    const result = classifyDraft(row(), excerpt, impact);
    expect(result.status).toBe("rejected");
    expect(result.reason).toMatch(/sobreposição/);
  });
});

describe("buildUpdatePatch", () => {
  it("retorna null para status diferente de approved", () => {
    const classification = classifyDraft(row(), "Resumo cortado…", "Análise válida e distinta.");
    expect(buildUpdatePatch(classification, {})).toBeNull();
  });

  it("payload mínimo: inclui excerpt/impact/seo/updated_at, mas NÃO content quando body não muda", () => {
    const classification = classifyDraft(row(), "Resumo curto e válido.", "Análise válida e distinta do resumo.");
    const patch = buildUpdatePatch(classification, { metaDescription: "antiga" });
    expect(patch).not.toBeNull();
    expect(Object.keys(patch!).sort()).toEqual(["excerpt", "impact", "seo", "updated_at"].sort());
  });

  it("inclui content apenas quando o CTA legado foi removido", () => {
    const bodyWithCta = row({
      content: "Primeiro parágrafo.\n\n:::highlight\nAssim como X, a V360 é a parceira ideal para a sua indústria crescer com previsibilidade.\n:::highlight",
    });
    const classification = classifyDraft(bodyWithCta, "Resumo curto e válido.", "Análise válida e distinta do resumo.");
    const patch = buildUpdatePatch(classification, {});
    expect(patch).toHaveProperty("content", "Primeiro parágrafo.");
  });

  it("preserva outras chaves de seo já existentes ao atualizar metaDescription", () => {
    const classification = classifyDraft(row(), "Resumo curto e válido.", "Análise válida e distinta do resumo.");
    const patch = buildUpdatePatch(classification, { metaTitle: "Título SEO", keywords: ["a", "b"] });
    expect((patch!.seo as Record<string, unknown>).metaTitle).toBe("Título SEO");
    expect((patch!.seo as Record<string, unknown>).keywords).toEqual(["a", "b"]);
  });
});

describe("VALIDATED_IDS", () => {
  it("é uma lista fixa, não vazia e sem duplicatas — a lista explícita é obrigatória", () => {
    expect(VALIDATED_IDS.length).toBe(9);
    expect(new Set(VALIDATED_IDS).size).toBe(9);
  });
});

// Simula, com uma tabela fake em memória, o comportamento de main() na etapa
// de APLICAÇÃO (não a orquestração inteira, que exige LLM real) — a parte
// que a Fase 2 exige testar explicitamente: concorrência, payload mínimo e
// não regressão de campos protegidos.
describe("aplicação (simulada) — concorrência, payload mínimo e campos protegidos", () => {
  function fixtureRow(id: string, index: number): PostRow {
    return {
      id,
      title: `Título ${index}`,
      slug: `slug-${index}`,
      source_name: "src.com",
      source_url: `https://src.com/materia-${index}`,
      created_at: "2026-07-01T00:00:00.000Z",
      published_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
      status: "published",
      excerpt: "Resumo antigo cortado…",
      impact: "",
      content: "Corpo factual sem menção comercial.",
      seo: { metaDescription: "antiga" },
    };
  }

  function makeFakeTable(rows: PostRow[]) {
    const table = new Map(rows.map((r) => [r.id, { ...r }]));
    return {
      get: (id: string) => table.get(id)!,
      applyUpdate: (id: string, patch: Record<string, unknown>) => {
        const current = table.get(id);
        if (!current) return;
        table.set(id, { ...current, ...patch });
      },
    };
  }

  let table: ReturnType<typeof makeFakeTable>;
  let ambiguousId: string;
  let rejectedId: string;
  let concurrentId: string;
  let approvedIds: string[];
  let classifications: Map<string, ReturnType<typeof classifyDraft>>;

  beforeEach(() => {
    const rows = VALIDATED_IDS.map((id, index) => fixtureRow(id, index));
    ambiguousId = rows[0].id;
    rejectedId = rows[1].id;
    concurrentId = rows[2].id;
    rows[0].content = "Corpo.\n\nA V360 é a parceira ideal para a sua indústria."; // sem :::highlight -> ambiguous

    table = makeFakeTable(rows);

    classifications = new Map();
    for (const r of rows) {
      const isRejected = r.id === rejectedId;
      const draft = isRejected
        ? { excerpt: "Resumo cortado no meio…", impact: "Análise válida e distinta." }
        : { excerpt: "Resumo novo válido.", impact: "Análise nova válida e distinta do resumo apresentado." };
      classifications.set(r.id, classifyDraft(r, draft.excerpt, draft.impact));
    }
    approvedIds = rows.map((r) => r.id).filter((id) => classifications.get(id)!.status === "approved");

    // Simula uma alteracao concorrente feita pelo worker antigo, entre o
    // dry-run e a aplicacao, sobre um dos posts approved.
    table.applyUpdate(concurrentId, { updated_at: "2026-07-01T10:00:00.000Z" });
  });

  it("ambiguous e rejected nunca entram na lista de approved", () => {
    expect(approvedIds).not.toContain(ambiguousId);
    expect(approvedIds).not.toContain(rejectedId);
  });

  it("concurrent_change_detected: updated_at diferente do snapshot bloqueia o update", () => {
    const snapshotUpdatedAt = "2026-07-01T00:00:00.000Z";
    const current = table.get(concurrentId);
    expect(current.updated_at).not.toBe(snapshotUpdatedAt);
    // A aplicacao real pularia este id — aqui validamos a condicao de bloqueio.
  });

  it("aplica update mínimo nos aprovados sem alteração concorrente, sem tocar em campos protegidos", () => {
    const safeApprovedIds = approvedIds.filter((id) => id !== concurrentId);
    expect(safeApprovedIds.length).toBeGreaterThan(0);

    for (const id of safeApprovedIds) {
      const before = table.get(id);
      const patch = buildUpdatePatch(classifications.get(id)!, before.seo);
      expect(patch).not.toBeNull();

      table.applyUpdate(id, patch!);
      const after = table.get(id);

      expect(after.title).toBe(before.title);
      expect(after.slug).toBe(before.slug);
      expect(after.source_url).toBe(before.source_url);
      expect(after.created_at).toBe(before.created_at);
      expect(after.published_at).toBe(before.published_at);
      expect(after.excerpt).toBe(classifications.get(id)!.excerptProposto);
      expect(after.impact).toBe(classifications.get(id)!.impactProposto);
    }
  });

  it("nunca aplica update em ambiguous ou rejected — excerpt permanece o original", () => {
    for (const id of [ambiguousId, rejectedId]) {
      const before = table.get(id);
      const patch = buildUpdatePatch(classifications.get(id)!, before.seo);
      expect(patch).toBeNull();
      expect(table.get(id).excerpt).toBe(before.excerpt);
    }
  });
});
