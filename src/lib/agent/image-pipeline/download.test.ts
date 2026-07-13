import axios from "axios";
import { describe, expect, it, vi } from "vitest";
import { downloadImage } from "./download";

vi.mock("axios", () => ({
  default: { get: vi.fn(), isAxiosError: vi.fn() },
}));

const mockedAxios = vi.mocked(axios, { deep: true });

function bufferResponse(overrides: Partial<{ status: number; contentType: string; data: ArrayBuffer }> = {}) {
  const body = overrides.data ?? new TextEncoder().encode("fake-image-bytes").buffer;
  return {
    status: overrides.status ?? 200,
    headers: { "content-type": overrides.contentType ?? "image/jpeg" },
    data: body,
  };
}

describe("downloadImage", () => {
  it("aceita HTTP 200 com content-type image/* e buffer não-vazio", async () => {
    mockedAxios.get.mockResolvedValueOnce(bufferResponse());
    const result = await downloadImage("https://example.com/foto.jpg");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contentType).toBe("image/jpeg");
      expect(result.buffer.length).toBeGreaterThan(0);
    }
  });

  it("rejeita status HTTP diferente de 200 (invalid_http_status)", async () => {
    mockedAxios.get.mockResolvedValueOnce(bufferResponse({ status: 404 }));
    const result = await downloadImage("https://example.com/foto.jpg");
    expect(result).toEqual({ ok: false, reason: "invalid_http_status" });
  });

  // Cenário G do spec: URL .jpg cujo servidor devolve text/html (ex: pagina
  // de erro/challenge anti-bot) — nunca deve ser tratado como imagem so
  // pela extensao da URL.
  it("rejeita Content-Type text/html mesmo com URL terminada em .jpg (Cenário G — invalid_content_type)", async () => {
    mockedAxios.get.mockResolvedValueOnce(bufferResponse({ contentType: "text/html; charset=utf-8" }));
    const result = await downloadImage("https://example.com/foto.jpg");
    expect(result).toEqual({ ok: false, reason: "invalid_content_type" });
  });

  it("rejeita buffer vazio (empty_buffer)", async () => {
    mockedAxios.get.mockResolvedValueOnce(bufferResponse({ data: new ArrayBuffer(0) }));
    const result = await downloadImage("https://example.com/foto.jpg");
    expect(result).toEqual({ ok: false, reason: "empty_buffer" });
  });

  it("rejeita timeout (download_timeout)", async () => {
    const timeoutError = Object.assign(new Error("timeout of 10000ms exceeded"), { code: "ECONNABORTED" });
    mockedAxios.get.mockRejectedValueOnce(timeoutError);
    mockedAxios.isAxiosError.mockReturnValueOnce(true);
    const result = await downloadImage("https://example.com/foto.jpg");
    expect(result).toEqual({ ok: false, reason: "download_timeout" });
  });

  it("rejeita download que excede o limite de bytes (download_too_large)", async () => {
    const sizeError = Object.assign(new Error("maxContentLength size of 12000000 exceeded"), {});
    mockedAxios.get.mockRejectedValueOnce(sizeError);
    mockedAxios.isAxiosError.mockReturnValueOnce(true);
    const result = await downloadImage("https://example.com/foto.jpg");
    expect(result).toEqual({ ok: false, reason: "download_too_large" });
  });

  it("rejeita falha de rede genérica (download_failed)", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("network error"));
    mockedAxios.isAxiosError.mockReturnValueOnce(false);
    const result = await downloadImage("https://example.com/foto.jpg");
    expect(result).toEqual({ ok: false, reason: "download_failed" });
  });
});
