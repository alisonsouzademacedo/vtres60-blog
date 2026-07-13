// Fixtures reais (nao mockadas) para os testes da pipeline de imagem —
// geradas em memoria via sharp, sem depender de arquivos binarios versionados
// nem de rede. Usadas para exercitar QA/processamento/hash de verdade.
import sharp from "sharp";

export async function makeJpegBuffer(
  width: number,
  height: number,
  background: { r: number; g: number; b: number } = { r: 90, g: 110, b: 140 },
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

export function makeCorruptBuffer(): Buffer {
  // Cabecalho JPEG valido seguido de lixo — decode_failed no sharp.
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("nao e uma imagem de verdade, so bytes aleatorios sem estrutura JPEG valida")]);
}

export const MASTER_SIZED_JPEG_DIMENSIONS = { width: 2400, height: 1200 } as const;
export const LOW_RES_JPEG_DIMENSIONS = { width: 400, height: 200 } as const;
