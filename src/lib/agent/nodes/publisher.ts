import { slugify } from "@/lib/content";
import { editorialRepository } from "@/services/editorial";
import { operationsRepository } from "@/services/operations";
import type { ManagedPost } from "@/types/editorial";
import type { AgentState, AgentStateUpdate } from "../state";
import { metaDescriptionFrom, stripBannedClosingPhrases } from "../text-guards";
import { filterValidCompanies, filterValidTagIds, isValidCategoryId, loadValidCategories, loadValidCompanyHubs, loadValidTags } from "../taxonomies";

const DEFAULT_AUTHOR_ID = "author-redacao-vtres60";

const DEFAULT_CTA = {
  label: "Falar com um especialista",
  url: "mailto:especialista@vtres60.com.br",
  text: "Transforme informação em uma próxima decisão clara.",
};

function readingTimeFrom(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// O slug pode colidir se o agente processar a mesma pauta duas vezes (ex:
// mesma URL de origem em execucoes diferentes). createPost() ja rejeita
// slugs duplicados via constraint UNIQUE do banco — aqui so adicionamos um
// sufixo numerico e tentamos de novo, em vez de deixar a execucao falhar.
async function createPostWithUniqueSlug(
  payload: Omit<ManagedPost, "id" | "createdAt" | "updatedAt">,
): Promise<ManagedPost> {
  const baseSlug = payload.slug;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const slug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
    try {
      return await editorialRepository.createPost({ ...payload, slug });
    } catch (error) {
      const isSlugConflict = error instanceof Error && error.message.includes("slug");
      if (!isSlugConflict || attempt === 5) throw error;
    }
  }
  throw new Error("Publisher: nao foi possivel gerar um slug unico apos 5 tentativas.");
}

/**
 * Persiste o post gerado como RASCUNHO (status "draft") — o agente nunca
 * publica direto, sempre aguarda aprovacao humana no painel admin.
 *
 * Reaproveita `editorialRepository.createPost()` (a mesma camada usada
 * pelo painel admin) em vez de um INSERT via supabaseAdmin duplicado aqui:
 * assim o agente ganha de graca a checagem de slug unico contra a
 * constraint do banco e o mapeamento camelCase<->snake_case ja validado
 * na migracao, sem re-implementar (e arriscar divergir de) essa logica.
 */
export async function publisherNode(state: AgentState): Promise<AgentStateUpdate> {
  if (!state.finalPost) {
    throw new Error("Publisher: finalPost ausente no state.");
  }
  // Fase 4 — defesa em profundidade: o workflow.ts ja roteia
  // image_pipeline_failed direto para END sem passar pelo Publisher (ver
  // routeAfterImageProcessing), mas o node em si tambem nunca deve rodar
  // sem um resultado de imagem aprovado, caso seja invocado fora do grafo
  // (ex: teste, reuso futuro).
  if (!state.imageResult || state.imageResult.status !== "success") {
    throw new Error("Publisher: imageResult ausente ou sem sucesso — pipeline de imagem precisa aprovar uma imagem antes da publicação.");
  }
  const imageResult = state.imageResult;

  const { titulo, excerpt, impact, categoryId, tagIds, companies } = state.finalPost;

  // Fase 3 — backstop final de classificacao: o InternalAuditor ja rejeita
  // (mecanicamente, ate MAX_DRAFT_ATTEMPTS) um categoryId ausente ou fora
  // da lista real de categorias — mas se o LLM NUNCA convergir para um id
  // valido dentro do teto de tentativas, chegamos aqui com
  // auditApproved=false E categoryId ainda invalido. Diferente de
  // excerpt/impact (que na pior hipotese viram rascunho de emergencia para
  // revisao humana), um post SEM categoria valida nao e criado — nem como
  // draft. "Precisa de revisao humana" e uma coisa; "estruturalmente sem
  // categoria" e outra, e nao deve gerar registro nenhum.
  const validCategories = await loadValidCategories();
  if (!categoryId || !isValidCategoryId(categoryId, validCategories)) {
    await operationsRepository.log(
      "classification_failed",
      "agente",
      `Nenhum categoryId válido após ${state.draftAttempts} tentativa(s) — post NÃO criado. categoryId recebido: "${categoryId || "(vazio)"}" | fonte: ${state.sourceUrl ?? "desconhecida"} | título: ${titulo}`,
    );
    return {
      publishedPostId: undefined,
      currentStep: "Classificação falhou após todas as tentativas — nenhum post foi criado (classification_failed).",
    };
  }
  // Rede de seguranca final: mesmo com deteccao no Auditor + ate
  // MAX_DRAFT_ATTEMPTS reescritas, cliches como "por fim" as vezes
  // sobrevivem ate o fallback de emergencia (visto em producao: 5
  // tentativas seguidas na mesma fonte, o LLM sempre reintroduzia a
  // frase). Aqui e deterministico — nunca publica o cliche, nao importa
  // o que aconteceu rio acima.
  //
  // Fase 2: o corpo NAO recebe mais paragrafo de CTA forcado
  // (ensureV360ClosingParagraph foi removido) — o CTA comercial agora vive
  // exclusivamente em `cta` (abaixo), renderizado pelo site como um
  // componente separado ("Proxima decisao"), nunca dentro do texto da
  // materia. excerpt/impact vem do draft ja validado deterministicamente
  // pelo InternalAuditor (ver text-guards.ts validateExcerpt/validateImpact)
  // — o Publisher so persiste, nunca deriva ou corrige esses campos aqui.
  const conteudo = stripBannedClosingPhrases(state.finalPost.conteudo);
  const now = new Date().toISOString();

  // Publicacao automatica so acontece quando QUEM DISPAROU pediu
  // (state.autoPublish, setado pela rota /api/agent/cron) E a auditoria
  // aprovou. Se chegou aqui com auditoria reprovada (esgotou tentativas em
  // routeAfterAudit), cai como draft para revisao humana de emergencia,
  // independente de quem disparou. Fluxo manual (admin/trigger) sem
  // autoPublish sempre gera draft, mesmo aprovado — humano revisa antes de
  // publicar.
  const status: ManagedPost["status"] = state.autoPublish && state.auditApproved ? "published" : "draft";

  // Fase 3 — tags/companies sao enriquecimento OPCIONAL, nao um requisito
  // estrutural como categoryId: uma associacao invalida individual e
  // filtrada (nunca persistida) e registrada em log, mas nao bloqueia a
  // publicacao — lista vazia e um resultado legitimo (ex: BYD nao tem hub).
  const [validTags, validCompanyHubs] = await Promise.all([loadValidTags(), Promise.resolve(loadValidCompanyHubs())]);
  const tagFilter = filterValidTagIds(tagIds, validTags);
  const companyFilter = filterValidCompanies(companies, validCompanyHubs);
  if (tagFilter.rejected.length || companyFilter.rejected.length) {
    await operationsRepository.log(
      "classificacao_taxonomia",
      "agente",
      `tags rejeitadas: [${tagFilter.rejected.join(", ")}] | companies rejeitadas: [${companyFilter.rejected.join(", ")}] | título: ${titulo}`,
    );
  }

  const post = await createPostWithUniqueSlug({
    title: titulo,
    slug: slugify(titulo),
    excerpt,
    content: conteudo,
    // Fase 4 — featured_image passa a ser a URL do Supabase Storage
    // (nunca mais o hotlink externo direto). imageResult ja foi validado
    // (download, QA, processamento, dedupe, upload) pelo ImageProcessor —
    // o Publisher so persiste, nunca recalcula origin/hash/width/height/credit.
    featuredImage: imageResult.finalImageUrl,
    imageCaption: "",
    // Fase 7 (Secao 29) — as 3 origens de imagem (source_og, generated_replicate,
    // pexels) sao sempre meramente ilustrativas do fato central (nunca
    // comunicam informacao adicional que o titulo/corpo ja nao digam), e o
    // titulo fica sempre imediatamente adjacente na pagina (header do
    // artigo). alt="" e a escolha correta aqui (WCAG: imagem decorativa
    // com texto equivalente ja adjacente) — repetir o titulo como alt era
    // redundante para leitores de tela, nao um bug de dado ausente.
    imageAlt: "",
    imageSourceUrl: imageResult.sourceUrl,
    imageCredit: imageResult.credit,
    imageOrigin: imageResult.origin,
    imageHash: imageResult.hash,
    imageWidth: imageResult.width,
    imageHeight: imageResult.height,
    categoryId,
    segmentSlugs: [],
    tagIds: tagFilter.valid,
    authorId: DEFAULT_AUTHOR_ID,
    publishedAt: now,
    scheduledAt: "",
    readingTime: readingTimeFrom(conteudo),
    status,
    featured: false,
    mainStory: false,
    displayOrder: 0,
    sourceName: state.sourceUrl ? hostnameOf(state.sourceUrl) : "",
    sourceUrl: state.sourceUrl ?? "",
    contentType: "noticia",
    impact,
    companies: companyFilter.valid,
    cta: DEFAULT_CTA,
    seo: {
      metaTitle: titulo,
      metaDescription: metaDescriptionFrom(excerpt),
      keywords: [],
      ogImage: imageResult.finalImageUrl,
      canonical: "",
      schemaType: "NewsArticle",
      // Selo/overlay do logo da empresa (Pipeline Inteligente de Imagens).
      // Guardado dentro do JSONB seo em vez de coluna propria — sem
      // migracao de schema necessaria. Ver SeoEntry em types/editorial.ts.
      companyLogoUrl: state.companyLogoUrl,
    },
    faq: [],
  });

  return {
    publishedPostId: post.id,
    currentStep:
      status === "published"
        ? "Publicado automaticamente com sucesso!"
        : state.auditApproved
          ? "Rascunho salvo com sucesso — aguardando aprovação humana."
          : "Auditoria reprovou após todas as tentativas — salvo como rascunho para revisão de emergência.",
  };
}
