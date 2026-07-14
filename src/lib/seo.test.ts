import { describe, expect, it } from "vitest";
import { absoluteUrl } from "./seo";

describe("absoluteUrl", () => {
  it("prefixa path relativo com siteUrl", () => {
    expect(absoluteUrl("/images/foo.png")).toBe("https://www.vtres60.com.br/blog/images/foo.png");
  });

  it("prefixa path relativo sem barra inicial", () => {
    expect(absoluteUrl("images/foo.png")).toBe("https://www.vtres60.com.br/blog/images/foo.png");
  });

  it("NÃO reprefixa uma URL já absoluta (https) — bug real: featured_image de posts reais já vem absoluto (Supabase Storage ou hotlink externo)", () => {
    const supabaseUrl =
      "https://fdsojpwznvephwdoghbn.supabase.co/storage/v1/object/public/editorial-images/posts/foo/bar.webp";
    expect(absoluteUrl(supabaseUrl)).toBe(supabaseUrl);
  });

  it("NÃO reprefixa uma URL http (não-https) absoluta", () => {
    const externalUrl = "http://exemplo.com/imagem.jpg";
    expect(absoluteUrl(externalUrl)).toBe(externalUrl);
  });

  it("mantém protocol-relative (//) como está — já é absoluta o suficiente para uso em og:image/JSON-LD", () => {
    expect(absoluteUrl("//cdn.exemplo.com/img.jpg")).toBe("//cdn.exemplo.com/img.jpg");
  });
});
