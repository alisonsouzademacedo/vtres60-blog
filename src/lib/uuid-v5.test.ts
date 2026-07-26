import { describe, expect, it } from "vitest";
import { uuidV5 } from "./uuid-v5";

// Namespace DNS padrão da RFC 4122 (Apêndice C) — usado só para validar a
// implementação contra um vetor de referência oficial, não é o namespace
// real do projeto (ver company-legacy-ids.ts).
const RFC4122_DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("uuidV5", () => {
  it("bate com o valor canônico de referência (namespace DNS + 'www.example.com', verificado contra python uuid.uuid5)", () => {
    // Valor confirmado via `python3 -c "import uuid; print(uuid.uuid5(uuid.NAMESPACE_DNS, 'www.example.com'))"`
    expect(uuidV5("www.example.com", RFC4122_DNS_NAMESPACE)).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it("é determinístico: mesma entrada sempre produz o mesmo UUID", () => {
    const a = uuidV5("company-weg", RFC4122_DNS_NAMESPACE);
    const b = uuidV5("company-weg", RFC4122_DNS_NAMESPACE);
    expect(a).toBe(b);
  });

  it("produz UUIDs diferentes para nomes diferentes no mesmo namespace", () => {
    expect(uuidV5("company-weg", RFC4122_DNS_NAMESPACE)).not.toBe(uuidV5("company-gerdau", RFC4122_DNS_NAMESPACE));
  });

  it("produz UUIDs diferentes para o mesmo nome em namespaces diferentes", () => {
    const otherNamespace = "ce6a5120-b110-43c5-bf91-3ec9adc0f69a";
    expect(uuidV5("company-weg", RFC4122_DNS_NAMESPACE)).not.toBe(uuidV5("company-weg", otherNamespace));
  });

  it("sempre grava a versão 5 no nibble correto", () => {
    const uuid = uuidV5("qualquer-nome", RFC4122_DNS_NAMESPACE);
    expect(uuid[14]).toBe("5");
  });

  it("sempre grava a variante RFC 4122 (10xx) no nibble correto", () => {
    const uuid = uuidV5("qualquer-nome", RFC4122_DNS_NAMESPACE);
    expect(["8", "9", "a", "b"]).toContain(uuid[19]);
  });

  it("sempre produz um UUID em formato válido (8-4-4-4-12)", () => {
    const uuid = uuidV5("qualquer-nome", RFC4122_DNS_NAMESPACE);
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("rejeita namespace inválido", () => {
    expect(() => uuidV5("qualquer-nome", "nao-e-um-uuid")).toThrow();
  });
});
