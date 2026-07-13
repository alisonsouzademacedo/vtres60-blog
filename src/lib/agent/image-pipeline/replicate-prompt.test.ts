import { describe, expect, it } from "vitest";
import { buildReplicatePrompt } from "./replicate-prompt";

const baseInput = {
  titulo: "Fiemg aponta resiliência da indústria mineira no primeiro semestre",
  excerpt: "O indicador de produção industrial de Minas Gerais recuou 2,3% no período.",
  impact: "O dado pode indicar cautela de investimento no setor nos próximos meses.",
  imageKeyword: "industrial production index Minas Gerais",
  categoryName: "Economia Industrial",
};

describe("buildReplicatePrompt", () => {
  it("nunca instrui geração de números, gráficos ou texto legível (Cenário B — FIEMG, sem inventar indicadores)", () => {
    const prompt = buildReplicatePrompt(baseInput);
    expect(prompt).toMatch(/no numbers/i);
    expect(prompt).toMatch(/no charts/i);
    expect(prompt).toMatch(/no text/i);
    expect(prompt).toMatch(/no readable signage/i);
  });

  it("proíbe explicitamente estética cyberpunk/holograma/UI flutuante/neon azul (Cenário D — CRM industrial)", () => {
    const prompt = buildReplicatePrompt({
      titulo: "Fornecedor de CRM lança módulo para indústria B2B",
      excerpt: "A nova versão promete unificar dados comerciais de fábricas de médio porte.",
      impact: "Pode acelerar a digitalização comercial de fornecedores industriais.",
      imageKeyword: "industrial B2B sales software",
      categoryName: "Tecnologia Industrial",
    });
    expect(prompt).toMatch(/no cyberpunk/i);
    expect(prompt).toMatch(/no holograms/i);
    expect(prompt).toMatch(/no floating UI/i);
    expect(prompt).toMatch(/no excessive blue neon/i);
    expect(prompt).toMatch(/no HUD/i);
  });

  it("evita explicitamente o clichê de dois trabalhadores com tablet ao lado de braço robótico", () => {
    const prompt = buildReplicatePrompt(baseInput);
    expect(prompt).toMatch(/cliché composition of two workers looking at a tablet beside a robotic arm/i);
  });

  it("nunca envia o corpo completo da notícia — apenas título, excerpt, impact, keyword e categoria", () => {
    const prompt = buildReplicatePrompt(baseInput);
    expect(prompt).toContain(baseInput.titulo);
    expect(prompt).toContain(baseInput.excerpt);
    expect(prompt).toContain(baseInput.impact);
    expect(prompt).toContain(baseInput.categoryName);
  });

  it("funciona sem nome de categoria (categoria não resolvida)", () => {
    const prompt = buildReplicatePrompt({ ...baseInput, categoryName: undefined });
    expect(prompt).toContain(baseInput.titulo);
  });
});
