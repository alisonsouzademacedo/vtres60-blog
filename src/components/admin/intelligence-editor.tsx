"use client";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useState } from "react";
import type { ManagedPost } from "@/types/editorial";
import type { IntelligenceItem, ManagedCompany, ManagedSegment, RadarSignal } from "@/types/operations";

type Draft = Omit<IntelligenceItem, "sourceUrls" | "createdAt" | "updatedAt">;

function blank(signals: RadarSignal[]): Draft {
  return { id: "", radarSignalId: signals[0]?.id ?? "", kind: "fact", title: "", analysis: "", recommendedAction: "", evidencePostIds: [], segmentSlugs: [], companySlugs: [], confidence: "média", generatedAt: new Date().toISOString(), validUntil: "", status: "draft" };
}

export function IntelligenceEditor({ initial, signals, posts, segments, companies }: { initial?: IntelligenceItem; signals: RadarSignal[]; posts: ManagedPost[]; segments: ManagedSegment[]; companies: ManagedCompany[] }) {
  const router = useRouter();
  const isNew = !initial;
  const [data, setData] = useState<Draft>(initial ?? blank(signals));
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("Alterações ainda não salvas");
  const change = (key: keyof Draft, value: unknown) => { setData((current) => ({ ...current, [key]: value })); setState("idle"); setMessage("Alterações ainda não salvas"); };
  const toggle = (key: "evidencePostIds" | "segmentSlugs" | "companySlugs", value: string) => {
    const current = data[key] as string[];
    change(key, current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  };
  async function save(status?: IntelligenceItem["status"]) {
    setState("saving"); setMessage("Salvando...");
    const payload = status ? { ...data, status, reviewedAt: status === "reviewed" ? new Date().toISOString() : data.reviewedAt } : data;
    const response = await fetch(isNew ? "/api/admin/intelligence" : `/api/admin/intelligence/${data.id}`, { method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) { setState("error"); setMessage(body.error || "Falha ao salvar."); return; }
    setData(body); setState("success"); setMessage("Alterações salvas.");
    if (isNew) router.replace(`/admin/inteligencia/${body.id}`);
    router.refresh();
  }
  return <div className="admin-form">
    <details className="admin-section" open><summary>Item de inteligência</summary><div className="admin-section-body"><div className="admin-fields">
      <div className="admin-field"><label htmlFor="intel-signal">Sinal do Radar de origem</label><select id="intel-signal" value={data.radarSignalId} onChange={(e) => change("radarSignalId", e.target.value)}>{signals.map((signal) => <option key={signal.id} value={signal.id}>{signal.title}</option>)}</select></div>
      <div className="admin-field"><label htmlFor="intel-kind">Tipo</label><select id="intel-kind" value={data.kind} onChange={(e) => change("kind", e.target.value)}><option value="fact">Fato</option><option value="analysis">Análise VTRES60</option><option value="recommendation">Recomendação</option></select></div>
      <div className="admin-field admin-field-full"><label htmlFor="intel-title">Título</label><input id="intel-title" value={data.title} onChange={(e) => change("title", e.target.value)} /></div>
      <div className="admin-field admin-field-full"><label htmlFor="intel-analysis">Análise</label><textarea id="intel-analysis" value={data.analysis} onChange={(e) => change("analysis", e.target.value)} /></div>
      {data.kind === "recommendation" && <div className="admin-field admin-field-full"><label htmlFor="intel-action">Ação recomendada</label><input id="intel-action" value={data.recommendedAction ?? ""} onChange={(e) => change("recommendedAction", e.target.value)} /></div>}
      <div className="admin-field"><label htmlFor="intel-valid">Válido até</label><input id="intel-valid" type="date" value={data.validUntil.slice(0, 10)} onChange={(e) => change("validUntil", e.target.value ? new Date(`${e.target.value}T23:59:59Z`).toISOString() : "")} /></div>
      <div className="admin-field admin-field-full"><label>Posts de evidência</label><div className="admin-check-grid">{posts.map((post) => <label className="admin-check" key={post.id}><input type="checkbox" checked={data.evidencePostIds.includes(post.id)} onChange={() => toggle("evidencePostIds", post.id)} />{post.title}</label>)}</div></div>
      <div className="admin-field admin-field-full"><label>Segmentos</label><div className="admin-check-grid">{segments.map((segment) => <label className="admin-check" key={segment.slug}><input type="checkbox" checked={data.segmentSlugs.includes(segment.slug)} onChange={() => toggle("segmentSlugs", segment.slug)} />{segment.name}</label>)}</div></div>
      <div className="admin-field admin-field-full"><label>Empresas</label><div className="admin-check-grid">{companies.map((company) => <label className="admin-check" key={company.slug}><input type="checkbox" checked={data.companySlugs.includes(company.slug)} onChange={() => toggle("companySlugs", company.slug)} />{company.name}</label>)}</div></div>
    </div></div></details>
    <div className="admin-savebar"><span data-state={state}>{message}</span>
      <button className="admin-secondary-button" onClick={() => save()} disabled={state === "saving"}>Salvar rascunho</button>
      <button className="admin-secondary-button" onClick={() => save("reviewed")} disabled={state === "saving"}>Marcar como revisado</button>
      <button className="admin-primary-button" onClick={() => save("published")} disabled={state === "saving"}><Save size={14} />Publicar</button>
    </div>
  </div>;
}
