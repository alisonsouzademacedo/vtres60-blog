import { describe, expect, it, vi } from "vitest";

// Isolado num arquivo próprio porque mocka node:fs — mesmo com passthrough
// para tudo que não seja o asset oficial, é mais seguro manter longe dos
// outros testes de processing.ts (que dependem de sharp/fs funcionando
// normalmente).
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (path: string, ...rest: unknown[]) => {
      if (String(path).includes("icon.svg")) {
        throw new Error("ENOENT: simulado — asset oficial ausente neste teste");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (actual.readFileSync as any)(path, ...rest);
    },
  };
});

import { processAndSignImage } from "./processing";
import { makeJpegBuffer } from "./test-fixtures";

describe("processAndSignImage — Cenário J-D: generated_replicate sem asset oficial válido", () => {
  it("não aplica assinatura nem inventa uma quando o asset oficial não está disponível", async () => {
    const buffer = await makeJpegBuffer(2400, 1200);
    const processed = await processAndSignImage(buffer, true); // applySignature=true, mas asset "ausente"
    expect(processed.signed).toBe(false);
    // ainda assim entrega uma imagem processada válida (webp, dimensões master)
    expect(processed.buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });
});
