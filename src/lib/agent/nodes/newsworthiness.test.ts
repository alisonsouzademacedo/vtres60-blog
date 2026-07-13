import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("../llm", () => ({ llm: { withStructuredOutput: () => ({ invoke: invokeMock }) } }));
const logMock = vi.fn();
vi.mock("@/services/operations", () => ({ operationsRepository: { log: (...a: unknown[]) => logMock(...a) } }));

import type { AgentState } from "../state";
import { newsworthinessNode } from "./newsworthiness";

beforeEach(() => {
  invokeMock.mockReset();
  logMock.mockReset();
});

function state(sourceText: string): AgentState {
  return { sourceUrl: "https://exemplo.com/materia", sourceText } as AgentState;
}

describe("newsworthinessNode (Fase 3)", () => {
  it("isNewsworthy=true para indicador econômico datado", async () => {
    invokeMock.mockResolvedValue({ isNewsworthy: true, newsworthinessReason: "Divulgação de indicador da FIESP.", eventDateOrPeriod: "primeiro semestre de 2026" });
    const result = await newsworthinessNode(state("A FIESP divulgou queda de 5% no faturamento no primeiro semestre de 2026."));
    expect(result.isNewsworthy).toBe(true);
    expect(result.eventDateOrPeriod).toBe("primeiro semestre de 2026");
  });

  it("isNewsworthy=false para conteúdo evergreen genérico", async () => {
    invokeMock.mockResolvedValue({ isNewsworthy: false, newsworthinessReason: "Tema genérico sem evento ou dado datável.", eventDateOrPeriod: null });
    const result = await newsworthinessNode(state("O e-commerce está crescendo e a indústria pode aprender com isso."));
    expect(result.isNewsworthy).toBe(false);
    expect(result.newsworthinessReason).toMatch(/genérico/);
  });

  it("reason é sempre obrigatório na saída", async () => {
    invokeMock.mockResolvedValue({ isNewsworthy: true, newsworthinessReason: "Contratação de 207 pessoas anunciada.", eventDateOrPeriod: "6 de julho de 2026" });
    const result = await newsworthinessNode(state("A BYD contratou 207 pessoas nesta segunda-feira."));
    expect(result.newsworthinessReason).toBeTruthy();
  });

  it("eventDateOrPeriod aceita null quando a fonte não fornece data exata", async () => {
    invokeMock.mockResolvedValue({ isNewsworthy: true, newsworthinessReason: "Decisão tarifária confirmada, sem data exata na fonte.", eventDateOrPeriod: null });
    const result = await newsworthinessNode(state("O governo confirmou nova tarifa sobre o setor."));
    expect(result.eventDateOrPeriod).toBeUndefined();
  });

  it("registra log com URL, isNewsworthy, reason e eventDateOrPeriod", async () => {
    invokeMock.mockResolvedValue({ isNewsworthy: false, newsworthinessReason: "Sem fato novo.", eventDateOrPeriod: null });
    await newsworthinessNode(state("Marketing digital ganha força na indústria."));
    expect(logMock).toHaveBeenCalledWith("newsworthiness", "agente", expect.stringContaining("isNewsworthy=false"));
  });
});
