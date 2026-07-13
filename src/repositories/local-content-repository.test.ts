import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("local-content-repository.ts — mapeamento de impact (Fase 2)", () => {
  const source = readFileSync(path.join(__dirname, "local-content-repository.ts"), "utf8");

  it("NÃO usa mais excerpt como fallback de impact", () => {
    expect(source).not.toMatch(/impact:\s*post\.impact\s*\|\|\s*post\.excerpt/);
  });

  it("mapeia impact diretamente do post (sem fallback automático)", () => {
    expect(source).toMatch(/impact:post\.impact,/);
  });

  it("preserva compareByRecency na ordenação (Fase 1, não deve regredir)", () => {
    expect(source).toMatch(/import \{ compareByRecency \} from "@\/lib\/article-ordering"/);
    expect(source).toMatch(/\.sort\(compareByRecency\)/);
  });
});
