/**
 * Autenticacao compartilhada das rotas machine-to-machine do agente
 * (/api/agent/trigger e /api/agent/cron). Bearer token, NAO o cookie de
 * sessao do painel admin — quem chama essas rotas e um servico/cron, nao
 * um navegador logado. Defina AGENT_API_KEY em .env.local.
 */
export function isAgentRequestAuthorized(request: Request): boolean {
  const expected = process.env.AGENT_API_KEY;
  if (!expected) return false;
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  return scheme === "Bearer" && token === expected;
}
