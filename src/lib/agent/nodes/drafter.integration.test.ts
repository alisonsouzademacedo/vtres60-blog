import { config as loadDotenv } from "dotenv";
import { describe, expect, it } from "vitest";

// Pré-condição da Fase 4 (Seção 2 do spec): a Fase 3 admitiu, no relatório
// final, uma lacuna — o cenário de empresa com hub válido mencionada apenas
// de forma SECUNDÁRIA (não central) nunca foi exercitado isoladamente.
//
// A proteção real contra esse caso NÃO é determinística: filterValidCompanies
// (taxonomies.ts) só valida se o NOME está na lista de hubs — ela não sabe
// distinguir "empresa central" de "empresa citada de passagem". Quem decide
// isso é o LLM, seguindo a REGRA DE CLASSIFICAÇÃO do DRAFTER_SYSTEM_PROMPT
// (prompts.ts). Por isso este teste, ao contrário de todos os outros testes
// de nó do agente, NÃO mocka `../llm` nem `@/services/editorial` — ele invoca
// a implementação real (drafterNode -> ChatOpenAI gpt-4o + Supabase real de
// categorias/tags) exatamente como o spec exige ("não crie um mock que
// devolva o resultado esperado sem exercer a seleção/validação atual").
//
// Isso tem um custo real: chamada de API paga, latência de rede e alguma
// variância inerente a LLM (o mesmo prompt pode, em casos-limite, produzir
// respostas diferentes). Por isso o teste fica fora da suíte padrão
// (`npm test` / CI) por padrão — só roda com RUN_LLM_INTEGRATION_TESTS=1,
// para não gastar créditos nem introduzir instabilidade em toda execução da
// suíte. Essa é uma limitação divulgada explicitamente, não uma lacuna
// escondida.
loadDotenv({ path: ".env.local" });

const shouldRun = process.env.RUN_LLM_INTEGRATION_TESTS === "1" && Boolean(process.env.OPENAI_API_KEY);

describe.skipIf(!shouldRun)("drafterNode — empresa secundária não deve virar companies (Fase 3, cenário I)", () => {
  it("não persiste WEG quando ela é apenas citada de passagem, e o fato central é outro", async () => {
    const { drafterNode } = await import("./drafter");

    const sourceText = `
BNDES anuncia nova linha de crédito de R$ 5 bilhões para modernização industrial em 2026

O Banco Nacional de Desenvolvimento Econômico e Social (BNDES) anunciou nesta quinta-feira uma
nova linha de crédito de R$ 5 bilhões destinada a médias empresas industriais que queiram investir
em modernização de maquinário e eficiência energética ao longo de 2026. A taxa de juros será
reduzida em relação às linhas anteriores, e o banco espera beneficiar cerca de 800 empresas em
todo o país até o fim do ano.

Segundo o presidente do BNDES, a medida busca reduzir o gap de produtividade da indústria
brasileira frente a outros países emergentes. "Precisamos que empresas de médio porte também
tenham acesso a crédito em condições competitivas", afirmou, durante o anúncio em Brasília.

Grandes indústrias já utilizam linhas de crédito semelhantes do BNDES para seus próprios projetos
de expansão — a WEG, por exemplo, tomou financiamento do banco em anos anteriores para ampliar
sua fábrica de motores elétricos. No entanto, a empresa não tem qualquer participação nesta nova
linha específica anunciada hoje, que é voltada exclusivamente a médias empresas, categoria da qual
a WEG não faz mais parte.

O BNDES informou que as inscrições para a nova linha abrem no dia 1º de fevereiro de 2026, e que
os detalhes operacionais serão divulgados em um manual específico até o fim de janeiro.
`.trim();

    const state = {
      sourceUrl: "https://example.com/bndes-linha-credito",
      sourceText,
      draftText: "",
      finalPost: undefined,
      imageKeyword: "",
      imageResult: undefined,
      ogImage: undefined,
      ogImageAlt: undefined,
      companyDomain: undefined,
      companyLogoUrl: undefined,
      currentStep: "",
      auditApproved: false,
      auditFeedback: undefined,
      draftAttempts: 0,
      publishedPostId: undefined,
      autoPublish: false,
      queueItemId: undefined,
      dedupeStatus: undefined,
      exactDuplicatePostId: undefined,
      materialUpdateReason: undefined,
      relatedPostId: undefined,
      isNewsworthy: false,
      newsworthinessReason: undefined,
      eventDateOrPeriod: undefined,
    };

    const result = await drafterNode(state);

    // Central: BNDES/linha de crédito. Secundária: WEG (citada só como
    // exemplo histórico, explicitamente excluída desta linha no texto).
    const finalPost = result.finalPost as { companies: string[] } | undefined;
    expect(finalPost?.companies ?? []).not.toContain("WEG");
  }, 30_000);

  // Variante exigida pelo spec (Fase 4, Seção 13/G4): companyDomain sozinho
  // não pode tornar uma empresa "central". Aqui o texto inclui o domínio
  // oficial da WEG explicitamente (weg.net) — se a associação dependesse
  // apenas de "um domínio foi identificado" (em vez de centralidade real do
  // fato), companies incluiria "WEG" indevidamente.
  it("não persiste WEG mesmo quando o domínio oficial dela aparece no texto, se ela continua secundária", async () => {
    const { drafterNode } = await import("./drafter");

    const sourceText = `
Sindicato das Indústrias Metalúrgicas anuncia acordo coletivo com reajuste de 6% para 40 mil trabalhadores

O Sindicato das Indústrias Metalúrgicas, Mecânicas e de Material Elétrico (Sindimetal) fechou nesta
terça-feira um acordo coletivo de trabalho que prevê reajuste salarial de 6% para cerca de 40 mil
trabalhadores da categoria em todo o estado, além de um abono de R$ 1.200 a ser pago em outubro de 2026.

O acordo foi assinado após três meses de negociação entre o sindicato patronal e os representantes
dos trabalhadores, e vale para empresas de médio e pequeno porte do setor metalúrgico associadas ao
sindicato — não inclui diretamente as grandes fabricantes do setor, que negociam acordos próprios
em separado.

Entre os exemplos citados durante a coletiva de imprensa como referência de política salarial do
setor, um dos negociadores mencionou a WEG (cujo site institucional é weg.net) como uma empresa que
historicamente pratica reajustes acima do piso da categoria — mas fez questão de frisar que a WEG
não é signatária deste acordo específico, que se aplica apenas às associadas ao Sindimetal.

O novo acordo passa a valer a partir de 1º de agosto de 2026 e terá vigência de 12 meses.
`.trim();

    const state = {
      sourceUrl: "https://example.com/sindimetal-acordo-coletivo",
      sourceText,
      draftText: "",
      finalPost: undefined,
      imageKeyword: "",
      imageResult: undefined,
      ogImage: undefined,
      ogImageAlt: undefined,
      companyDomain: undefined,
      companyLogoUrl: undefined,
      currentStep: "",
      auditApproved: false,
      auditFeedback: undefined,
      draftAttempts: 0,
      publishedPostId: undefined,
      autoPublish: false,
      queueItemId: undefined,
      dedupeStatus: undefined,
      exactDuplicatePostId: undefined,
      materialUpdateReason: undefined,
      relatedPostId: undefined,
      isNewsworthy: false,
      newsworthinessReason: undefined,
      eventDateOrPeriod: undefined,
    };

    const result = await drafterNode(state);

    // Central: Sindimetal/acordo coletivo. Secundária: WEG, mencionada como
    // exemplo com domínio explícito (weg.net) — companyDomain pode até vir
    // preenchido pelo LLM, mas companies NUNCA pode incluir WEG só por isso.
    const finalPost = result.finalPost as { companies: string[] } | undefined;
    expect(finalPost?.companies ?? []).not.toContain("WEG");
  }, 30_000);
});
