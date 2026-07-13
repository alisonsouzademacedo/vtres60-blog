import { describe, expect, it } from "vitest";
import { processAndSignImage, qaTechnicalCheck } from "./processing";
import { makeCorruptBuffer, makeJpegBuffer } from "./test-fixtures";
import { MASTER_HEIGHT, MASTER_WIDTH } from "./types";

describe("qaTechnicalCheck", () => {
  it("aprova imagem com resolução suficiente para cobrir o master sem upscale significativo", async () => {
    const buffer = await makeJpegBuffer(2400, 1200);
    const result = await qaTechnicalCheck(buffer);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.width).toBe(2400);
      expect(result.height).toBe(1200);
    }
  });

  // Cenário F do spec: imagem tecnicamente válida, mas abaixo da resolução
  // mínima derivada do master — decode passa, mas é rejeitada por
  // resolution_too_low, sem tentar upscale agressivo.
  it("rejeita imagem válida mas abaixo da resolução mínima (Cenário F — resolution_too_low)", async () => {
    const buffer = await makeJpegBuffer(400, 200);
    const result = await qaTechnicalCheck(buffer);
    expect(result).toEqual({ ok: false, reason: "resolution_too_low" });
  });

  it("aceita upscale pequeno (dentro da tolerância) sem rejeitar", async () => {
    // MASTER_WIDTH/1.1 e MASTER_HEIGHT/1.1 exigem escala ~1.1x — dentro da
    // tolerância de 1.15x (ver MAX_ACCEPTABLE_UPSCALE_FACTOR).
    const width = Math.round(MASTER_WIDTH / 1.1);
    const height = Math.round(MASTER_HEIGHT / 1.1);
    const buffer = await makeJpegBuffer(width, height);
    const result = await qaTechnicalCheck(buffer);
    expect(result.ok).toBe(true);
  });

  // Cenário H do spec: Content-Type diz image/jpeg mas os bytes não
  // decodificam como imagem de verdade.
  it("rejeita bytes corrompidos (Cenário H — decode_failed)", async () => {
    const result = await qaTechnicalCheck(makeCorruptBuffer());
    expect(result).toEqual({ ok: false, reason: "decode_failed" });
  });
});

describe("processAndSignImage", () => {
  it("processa e redimensiona para as dimensões master exatas", async () => {
    const buffer = await makeJpegBuffer(2400, 1200);
    const processed = await processAndSignImage(buffer, false);
    expect(processed.width).toBe(MASTER_WIDTH);
    expect(processed.height).toBe(MASTER_HEIGHT);
    expect(processed.signed).toBe(false);
  });

  it("não assina quando applySignature=false (fonte real/Pexels, Cenário J)", async () => {
    const buffer = await makeJpegBuffer(2400, 1200);
    const processed = await processAndSignImage(buffer, false);
    expect(processed.signed).toBe(false);
  });

  it("assina quando applySignature=true e o asset oficial existe (Cenário J — generated_replicate)", async () => {
    const buffer = await makeJpegBuffer(2400, 1200);
    const processed = await processAndSignImage(buffer, true);
    // src/app/icon.svg existe no repositório real — a assinatura deve ser aplicada.
    expect(processed.signed).toBe(true);
  });

  // Cenário I do spec: duas origens diferentes produzindo os MESMOS bytes
  // finais processados devem gerar o MESMO SHA-256 — deduplicação é exata,
  // nunca "similaridade perceptual".
  it("gera o mesmo SHA-256 para os mesmos bytes de entrada (Cenário I — hash exato)", async () => {
    const bufferA = await makeJpegBuffer(2400, 1200);
    const bufferB = Buffer.from(bufferA); // mesma origem, cópia dos bytes
    const processedA = await processAndSignImage(bufferA, false);
    const processedB = await processAndSignImage(bufferB, false);
    expect(processedA.hash).toBe(processedB.hash);
  });

  it("gera hashes diferentes para conteúdos de imagem diferentes", async () => {
    const bufferA = await makeJpegBuffer(2400, 1200, { r: 90, g: 110, b: 140 });
    const bufferB = await makeJpegBuffer(2400, 1200, { r: 10, g: 200, b: 30 });
    const processedA = await processAndSignImage(bufferA, false);
    const processedB = await processAndSignImage(bufferB, false);
    expect(processedA.hash).not.toBe(processedB.hash);
  });

  it("entrega o formato final WebP", async () => {
    const buffer = await makeJpegBuffer(2400, 1200);
    const processed = await processAndSignImage(buffer, false);
    // Assinatura de arquivo WebP: "RIFF....WEBP"
    expect(processed.buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(processed.buffer.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });
});
