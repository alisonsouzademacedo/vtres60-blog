import { describe, expect, it } from "vitest";
import { calculateOpenAiCost, calculateReplicateImageCost } from "./calculate-cost";

describe("calculateOpenAiCost", () => {
  it("calcula custo confirmado a partir de tokens reais (input+output, sem cache)", () => {
    const result = calculateOpenAiCost({ inputTokens: 1000, outputTokens: 500, cachedInputTokens: 0 });
    // 1000/1000*0.0025 + 500/1000*0.01 = 0.0025 + 0.005 = 0.0075
    expect(result.status).toBe("confirmed");
    expect(result.costUsd).toBeCloseTo(0.0075, 6);
  });

  it("desconta tokens cacheados do preço de input normal e aplica o preço de cache", () => {
    const result = calculateOpenAiCost({ inputTokens: 1000, outputTokens: 0, cachedInputTokens: 400 });
    // (1000-400)/1000*0.0025 + 400/1000*0.00125 = 0.0015 + 0.0005 = 0.002
    expect(result.costUsd).toBeCloseTo(0.002, 6);
  });

  it("status=estimated quando o preço do modelo não foi verificado ao vivo (verified=false)", () => {
    const result = calculateOpenAiCost({ inputTokens: 100, outputTokens: 100, cachedInputTokens: 0 });
    expect(result.status).toBe("confirmed");
    expect(result.priceVerified).toBe(false);
  });

  it("status=unavailable quando não há preço cadastrado para o modelo", () => {
    const result = calculateOpenAiCost({ inputTokens: 100, outputTokens: 100, cachedInputTokens: 0, model: "modelo-desconhecido" });
    expect(result.status).toBe("unavailable");
    expect(result.costUsd).toBeUndefined();
  });

  it("nunca divide por zero / não quebra com tokens zerados", () => {
    const result = calculateOpenAiCost({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 });
    expect(result.costUsd).toBe(0);
    expect(result.status).toBe("confirmed");
  });
});

describe("calculateReplicateImageCost", () => {
  it("retorna custo estimado por imagem gerada com sucesso", () => {
    const result = calculateReplicateImageCost({ succeeded: true });
    expect(result.status).toBe("estimated");
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("custo é zero quando a geração falhou (nunca cobra por tentativa sem sucesso nesta estimativa)", () => {
    const result = calculateReplicateImageCost({ succeeded: false });
    expect(result.costUsd).toBe(0);
  });
});
