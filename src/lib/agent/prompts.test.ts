import { describe, expect, it } from "vitest";
import { AUDITOR_SYSTEM_PROMPT, DRAFTER_SYSTEM_PROMPT } from "./prompts";

describe("DRAFTER_SYSTEM_PROMPT (Fase 2)", () => {
  it("NÃO instrui mais um fechamento comercial obrigatório da V360 no body", () => {
    expect(DRAFTER_SYSTEM_PROMPT).not.toMatch(/termine com um call to action/i);
    expect(DRAFTER_SYSTEM_PROMPT).not.toMatch(/Assim como \[gancho da matéria\]/i);
    expect(DRAFTER_SYSTEM_PROMPT).not.toMatch(/últim[oa] parágrafo do texto/i);
  });

  it("instrui explicitamente a não incluir CTA/menção institucional no corpo", () => {
    expect(DRAFTER_SYSTEM_PROMPT).toMatch(/não inclua parágrafo de fechamento comercial/i);
  });

  it("preserva a regra contra alucinação de parceria (HARD FAIL de relacionamento)", () => {
    expect(DRAFTER_SYSTEM_PROMPT).toMatch(/NUNCA afirme, insinue ou sugira/i);
    expect(DRAFTER_SYSTEM_PROMPT).toMatch(/parceira do Grupo RIMA/i);
  });

  it("instrui explicitamente a geração de excerpt", () => {
    expect(DRAFTER_SYSTEM_PROMPT).toMatch(/REGRA DE EXCERPT/i);
    expect(DRAFTER_SYSTEM_PROMPT).toMatch(/nunca com reticências/i);
  });

  it("instrui explicitamente a geração de impact como análise separada do excerpt", () => {
    expect(DRAFTER_SYSTEM_PROMPT).toMatch(/REGRA DE IMPACT/i);
    expect(DRAFTER_SYSTEM_PROMPT).toMatch(/NÃO repita o excerpt/i);
  });

  it("não instrui a conectar a notícia ao serviço da V360 nem a gerar oportunidade comercial no impact", () => {
    expect(DRAFTER_SYSTEM_PROMPT).not.toMatch(/mostre como a v360 resolve/i);
    expect(DRAFTER_SYSTEM_PROMPT).not.toMatch(/gerar oportunidade comercial/i);
  });
});

describe("AUDITOR_SYSTEM_PROMPT (Fase 2)", () => {
  it("HARD FAIL de relacionamento falso continua ativo", () => {
    expect(AUDITOR_SYSTEM_PROMPT).toMatch(/HARD FAIL — RELACIONAMENTO FALSO/);
  });

  it("HARD FAIL de empresa em foco inventada continua ativo", () => {
    expect(AUDITOR_SYSTEM_PROMPT).toMatch(/HARD FAIL — EMPRESA EM FOCO INVENTADA/);
  });

  it("o HARD FAIL de relacionamento falso não depende mais de um 'último parágrafo' assumido", () => {
    expect(AUDITOR_SYSTEM_PROMPT).not.toMatch(/REGRA ZERO/);
    expect(AUDITOR_SYSTEM_PROMPT).not.toMatch(/o ultimo paragrafo \(mencao a v360 \+ cta\)/i);
  });

  it("não exige mais presença de CTA/parágrafo institucional como critério de aprovação", () => {
    expect(AUDITOR_SYSTEM_PROMPT).not.toMatch(/paragrafo final e sempre a mencao institucional/i);
  });
});
