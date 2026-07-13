import axios from "axios";
import { DOWNLOAD_TIMEOUT_MS, MAX_DOWNLOAD_BYTES, type ImageTierFailureReason } from "./types";

export interface DownloadResult {
  ok: true;
  buffer: Buffer;
  contentType: string;
}

export interface DownloadFailure {
  ok: false;
  reason: ImageTierFailureReason;
}

// Download server-side com validacao real dos bytes — nunca confia na
// extensao da URL nem aceita 200 como prova suficiente de que o corpo e
// realmente uma imagem (ver isFetchableImage em image-processor.ts antigo,
// que ja tinha esse cuidado para status/content-type; aqui estendemos para
// tambem validar tamanho e buffer nao-vazio antes de decodificar).
export async function downloadImage(url: string): Promise<DownloadResult | DownloadFailure> {
  try {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxContentLength: MAX_DOWNLOAD_BYTES,
      maxBodyLength: MAX_DOWNLOAD_BYTES,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VTres60Bot/1.0; +https://www.vtres60.com.br)" },
      validateStatus: () => true,
    });

    if (response.status !== 200) {
      return { ok: false, reason: "invalid_http_status" };
    }

    const contentType = String(response.headers["content-type"] ?? "");
    if (!contentType.startsWith("image/")) {
      return { ok: false, reason: "invalid_content_type" };
    }

    const buffer = Buffer.from(response.data);
    if (buffer.length === 0) {
      return { ok: false, reason: "empty_buffer" };
    }
    if (buffer.length > MAX_DOWNLOAD_BYTES) {
      return { ok: false, reason: "download_too_large" };
    }

    return { ok: true, buffer, contentType };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNABORTED" || error.message.toLowerCase().includes("timeout")) {
        return { ok: false, reason: "download_timeout" };
      }
      // axios rejeita quando maxContentLength/maxBodyLength e excedido
      // durante o stream (antes do buffer completo) — mesmo caso de
      // "download_too_large" acima, so que detectado a meio do download.
      if (error.message.toLowerCase().includes("maxcontentlength") || error.message.toLowerCase().includes("maxbodylength")) {
        return { ok: false, reason: "download_too_large" };
      }
    }
    return { ok: false, reason: "download_failed" };
  }
}
