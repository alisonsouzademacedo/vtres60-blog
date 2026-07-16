// Espelha src/lib/paths.ts (withBasePath) para os testes E2E — o app real
// roda sob NEXT_PUBLIC_BASE_PATH=/blog em producao. Playwright resolve um
// path com "/" inicial como relativo à ORIGEM do baseURL, não ao path do
// baseURL (ver comentário em playwright.config.ts) — por isso prefixamos
// aqui em vez de confiar em baseURL conter "/blog".
export const BASE_PATH = "/blog";

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}
