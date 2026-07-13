// Fase 5 — dry-run real da pipeline em produção, sem publicar (Seção 19).
// Script de operação, não faz parte da suíte de testes. Roda os nós reais
// em sequência (não o grafo compilado) para poder parar explicitamente
// ANTES do Publisher.
import { exactDedupeNode } from "../src/lib/agent/nodes/exact-dedupe";
import { newsworthinessNode } from "../src/lib/agent/nodes/newsworthiness";
import { drafterNode, MAX_DRAFT_ATTEMPTS } from "../src/lib/agent/nodes/drafter";
import { internalAuditorNode } from "../src/lib/agent/nodes/internal-auditor";
import { semanticDedupeNode } from "../src/lib/agent/nodes/semantic-dedupe";
import { imageProcessorNode } from "../src/lib/agent/nodes/image-processor";
import { supabaseAdmin } from "../src/lib/supabase";
import type { AgentState } from "../src/lib/agent/state";

const FIXTURE_SOURCE_TEXT = `
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

function initialState(): AgentState {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    sourceUrl: `https://example.com/fase5-dry-run-smoke-test-${ts}`,
    sourceText: FIXTURE_SOURCE_TEXT,
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
}

async function main() {
  const { count: postsBefore } = await supabaseAdmin.from("posts").select("id", { count: "exact", head: true });
  console.log("posts_count_before:", postsBefore);

  let state = initialState();

  console.log("\n[1] ExactDedupeGate...");
  state = { ...state, ...(await exactDedupeNode(state)) };
  console.log("dedupeStatus:", state.dedupeStatus);
  if (state.dedupeStatus === "exact_duplicate") throw new Error("fixture inesperadamente duplicada");

  console.log("\n[2] NewsworthinessGate...");
  state = { ...state, ...(await newsworthinessNode(state)) };
  console.log("isNewsworthy:", state.isNewsworthy, "| reason:", state.newsworthinessReason);
  if (!state.isNewsworthy) throw new Error("fixture não considerada noticiável — ajustar fixture");

  console.log("\n[3] Drafter <-> InternalAuditor...");
  for (let attempt = 0; attempt < MAX_DRAFT_ATTEMPTS; attempt += 1) {
    state = { ...state, ...(await drafterNode(state)) };
    state = { ...state, ...(await internalAuditorNode(state)) };
    console.log(`  tentativa ${state.draftAttempts}: auditApproved=${state.auditApproved}`);
    if (state.auditApproved) break;
  }
  console.log("categoryId:", state.finalPost?.categoryId);
  console.log("tagIds:", state.finalPost?.tagIds);
  console.log("companies:", state.finalPost?.companies);
  console.log("excerpt:", state.finalPost?.excerpt);
  console.log("impact:", state.finalPost?.impact);
  console.log("WEG (empresa secundária) NÃO deve estar em companies:", !(state.finalPost?.companies ?? []).includes("WEG"));

  console.log("\n[4] SemanticDedupeGate...");
  state = { ...state, ...(await semanticDedupeNode(state)) };
  console.log("dedupeStatus:", state.dedupeStatus);

  console.log("\n[5] ImageProcessor (Storage real, path de smoke-test)...");
  state = { ...state, ...(await imageProcessorNode(state)) };
  console.log("imageResult:", JSON.stringify(state.imageResult, null, 2));

  console.log("\n[6] Publisher — DELIBERADAMENTE NÃO EXECUTADO.");

  const { count: postsAfter } = await supabaseAdmin.from("posts").select("id", { count: "exact", head: true });
  console.log("\nposts_count_after:", postsAfter);
  console.log("NENHUM_POST_CRIADO:", postsBefore === postsAfter);

  if (state.imageResult?.status === "success") {
    const url = new URL(state.imageResult.finalImageUrl);
    const marker = "/object/public/editorial-images/";
    const idx = url.pathname.indexOf(marker);
    const storagePath = idx >= 0 ? url.pathname.slice(idx + marker.length) : undefined;
    if (storagePath) {
      console.log("\n[cleanup] removendo objeto de smoke-test do Storage:", storagePath);
      const { error } = await supabaseAdmin.storage.from("editorial-images").remove([storagePath]);
      console.log("cleanup error:", error);
      const check = await supabaseAdmin.storage.from("editorial-images").list(storagePath.split("/").slice(0, -1).join("/"));
      console.log("objetos restantes no path:", JSON.stringify(check.data));
    }
  } else {
    console.log("\n[cleanup] nenhum objeto foi criado no Storage (pipeline de imagem falhou) — nada a remover.");
  }

  console.log("\nAGENT_DRY_RUN_PRODUCTION_PASS=" + (postsBefore === postsAfter));
}

main().catch((error) => {
  console.error("DRY_RUN_FAILED:", error);
  process.exit(1);
});
