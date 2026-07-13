import { describe, expect, it, vi } from "vitest";

// supabaseAdmin.from(...) retorna um query builder encadeavel
// (select/eq/gte/limit/not, ...) que e "thenable" — await resolve o
// ultimo estado da cadeia. O mock abaixo reproduz esse contrato: cada
// metodo devolve o proprio objeto, e `then` resolve com o resultado
// configurado no teste.
function chainable(result: { data: unknown; error: unknown }) {
  const handler = {
    from: () => handler,
    select: () => handler,
    eq: () => handler,
    gte: () => handler,
    limit: () => handler,
    not: () => handler,
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  return handler;
}

const fromMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { isImageDuplicate } from "./dedupe";

describe("isImageDuplicate", () => {
  it("retorna false quando não há post recente com o mesmo hash nem a mesma URL", async () => {
    fromMock.mockReturnValue(chainable({ data: [], error: null }));
    const result = await isImageDuplicate("hash-unico", "https://example.com/foto.jpg");
    expect(result).toBe(false);
  });

  // Cenário I do spec: mesmo hash dentro da janela de 30 dias -> duplicate_image.
  it("retorna true quando o hash já existe em um post dentro da janela de 30 dias", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: [{ id: "post-existente" }], error: null }));
    const result = await isImageDuplicate("hash-repetido", undefined);
    expect(result).toBe(true);
  });

  it("retorna true quando image_source_url normalizada colide, mesmo com hash diferente", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: [], error: null })) // busca por hash: nada
      .mockReturnValueOnce(
        chainable({ data: [{ id: "post-x", image_source_url: "https://example.com/foto.jpg?utm_source=x" }], error: null }),
      );
    const result = await isImageDuplicate("hash-novo", "https://example.com/foto.jpg");
    expect(result).toBe(true);
  });

  it("propaga erro do Supabase em vez de mascarar como 'não duplicado'", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: null, error: { message: "erro de conexão" } }));
    await expect(isImageDuplicate("hash-qualquer", undefined)).rejects.toThrow("erro de conexão");
  });
});
