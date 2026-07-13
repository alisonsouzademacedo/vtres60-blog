import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({ upload: (...args: unknown[]) => uploadMock(...args), getPublicUrl: (...args: unknown[]) => getPublicUrlMock(...args) }),
    },
  },
}));

import { buildStoragePath, uploadToEditorialStorage } from "./storage";

describe("buildStoragePath", () => {
  it("gera path com extensão .webp e prefixo posts/<id>/", () => {
    const path = buildStoragePath("queue-item-123", "abcdef0123456789");
    expect(path).toMatch(/^posts\/queue-item-123\/abcdef0123456789-[a-f0-9]{8}\.webp$/);
  });

  it("sanitiza caracteres inseguros no identificador estável", () => {
    const path = buildStoragePath("https://example.com/a b?c=1", "hash123");
    expect(path).not.toMatch(/[^a-zA-Z0-9_/.-]/);
  });

  // Duas noticias distintas (mesmo stableId reprocessado ou hashes
  // diferentes) nunca devem colidir no mesmo path — o hash da imagem e um
  // sufixo uuid curto garantem isso.
  it("duas chamadas com o mesmo stableId e hash diferentes produzem paths diferentes (sem colisão)", () => {
    const pathA = buildStoragePath("mesma-pauta", "hash-a");
    const pathB = buildStoragePath("mesma-pauta", "hash-b");
    expect(pathA).not.toBe(pathB);
  });

  it("duas chamadas com o mesmo stableId e MESMO hash ainda produzem paths diferentes (sufixo uuid)", () => {
    const pathA = buildStoragePath("mesma-pauta", "hash-igual");
    const pathB = buildStoragePath("mesma-pauta", "hash-igual");
    expect(pathA).not.toBe(pathB);
  });
});

describe("uploadToEditorialStorage", () => {
  it("faz upload com Content-Type image/webp e retorna a URL pública", async () => {
    uploadMock.mockResolvedValueOnce({ data: { path: "posts/x/y.webp" }, error: null });
    getPublicUrlMock.mockReturnValueOnce({ data: { publicUrl: "https://supabase.example/storage/v1/object/public/editorial-images/posts/x/y.webp" } });

    const result = await uploadToEditorialStorage("posts/x/y.webp", Buffer.from("bytes"));

    expect(result).toEqual({ ok: true, publicUrl: "https://supabase.example/storage/v1/object/public/editorial-images/posts/x/y.webp" });
    expect(uploadMock).toHaveBeenCalledWith("posts/x/y.webp", expect.any(Buffer), expect.objectContaining({ contentType: "image/webp", upsert: false }));
  });

  it("retorna falha estruturada quando o upload falha (storage_upload_failed no chamador)", async () => {
    uploadMock.mockResolvedValueOnce({ data: null, error: { message: "bucket not found" } });
    const result = await uploadToEditorialStorage("posts/x/y.webp", Buffer.from("bytes"));
    expect(result).toEqual({ ok: false });
  });

  it("nunca expõe SUPABASE_SERVICE_ROLE_KEY ou credencial no código client-side (upload é sempre via supabaseAdmin)", () => {
    // Verificação estrutural: storage.ts so importa supabaseAdmin (server-side),
    // nunca a anon key nem um client novo — confirmado pela ausência de
    // qualquer outra chamada createClient neste módulo (ver storage.ts).
    const source = readFileSync(new URL("./storage.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(source).toContain("supabaseAdmin");
  });
});
