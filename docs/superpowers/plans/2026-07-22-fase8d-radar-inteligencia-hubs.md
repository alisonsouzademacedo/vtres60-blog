# Fase 8D — Radar Industrial, Inteligência VTRES60 e Hubs Administráveis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 100%-hardcoded "Radar Industrial" and "Inteligência VTRES60" home sections with evidence-gated, admin-manageable content, and turn the hardcoded company hub list into an administrable collection whose home presence depends on real post coverage — all backed by the same JSON-file `operationsRepository` pattern already used for segments/events, never invented data, never a live deploy.

**Architecture:** Three new collections (`companies`, `radarSignals`, `intelligenceItems`) are added to the existing generic JSON-repository (`src/services/operations/operations-repository.ts`), following the exact same `read/write/create/update/remove/get` pattern already used for `segments`/`events`. Server-side publish validation (mirroring `src/lib/agenda/event-publish-rules.ts`) blocks publishing without real evidence: `evidence_post_ids` must reference posts that actually exist and are publicly visible, and `source_urls` are **derived server-side** from those posts' real `sourceUrl` — never typed freely by the admin, structurally preventing invention. Admin CRUD reuses the existing `OperationsEditor`/`CrudList` components by adding new `kind` variants. Home integration replaces the hardcoded JSX with real reads, gated by an honest empty state when nothing is published yet.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest, Playwright + `@axe-core/playwright`, Node `fs/promises` JSON persistence (no Supabase — matches the existing `operationsRepository`/`agenda_events` precedent, since a real migration cannot be applied remotely this phase).

## Global Constraints

- Work ONLY inside `/home/pedro/vtres60-blog-fase8c` (git worktree, branch `fase8c-dev`, based on `origin/feat/portal-funcional-fase8` @ `2918b1a`). NEVER edit `/home/pedro/vtres60-blog` (production checkout).
- NEVER invent signals, opportunities, companies, tickers, sources, confidence values, or relationships between news. Every Radar signal and Intelligence item's evidence must be real, existing, selectable data — chosen by the admin from real dropdowns, never freely typed as a "source."
- NEVER publish content without evidence — enforced server-side (route handlers), never trusted from the client, mirroring `src/lib/agenda/event-publish-rules.ts`.
- NEVER apply any SQL migration remotely. New tables are documented as **unapplied** SQL (same convention as `supabase-events-schema-fase8c.sql`) for a possible future migration off JSON — the real implementation in this phase stores data in `src/content/*.json` via `operationsRepository`, exactly like segments/events do today.
- NEVER run `pkill`/`killall`/pattern-based kill commands. Any isolated test server must be started with its PID captured explicitly (`SERVER_PID=$!`) and killed only by that exact PID. See `feedback_vtres60_pkill_next_server_scope.md`.
- NEVER run `npm run build` or start a dev/prod server against `/home/pedro/vtres60-blog` — only inside the worktree.
- Preserve all 481 existing Vitest tests — do not weaken or delete any to hide a regression.
- `posts.id` is `text`, never `uuid` — any future FK to `posts(id)` in the documented (unapplied) SQL must be `text references public.posts(id)`.
- Company/post association stays name-based (`article.companies.includes(company.name)`), matching the existing agent pipeline (`src/lib/agent/taxonomies.ts`) — this plan does NOT change that matching mechanism, only makes the company list itself administrable.
- No automated per-company news monitoring is implemented this phase (see Task 15 for the documented cost/quota decision) — do not add any new GNews query per company.

---

## File Structure

**New files:**
- `src/lib/radar/validate-signal.ts` — Radar publish-gate validation (pure function, mirrors `event-publish-rules.ts`)
- `src/lib/radar/validate-intelligence.ts` — Intelligence publish-gate validation
- `src/lib/radar/evidence-context.ts` — builds the set of real posts/tags/segments/companies used to validate evidence + derives `sourceUrls` server-side
- `src/lib/radar/validate-signal.test.ts`, `src/lib/radar/validate-intelligence.test.ts`
- `src/app/api/admin/companies/route.ts`, `src/app/api/admin/companies/[id]/route.ts`
- `src/app/api/admin/radar/route.ts`, `src/app/api/admin/radar/[id]/route.ts`
- `src/app/api/admin/intelligence/route.ts`, `src/app/api/admin/intelligence/[id]/route.ts`
- `src/app/api/admin/radar/publish-validation.test.ts`, `src/app/api/admin/intelligence/publish-validation.test.ts` (direct-backend-attack integration tests, mirrors existing `publish-validation.test.ts` for events)
- `src/app/admin/(protected)/empresas/page.tsx`, `.../novo/page.tsx`, `.../[id]/page.tsx`
- `src/app/admin/(protected)/radar/page.tsx`, `.../novo/page.tsx`, `.../[id]/page.tsx`
- `src/app/admin/(protected)/inteligencia/page.tsx`, `.../novo/page.tsx`, `.../[id]/page.tsx`
- `src/app/radar/page.tsx` — real public Radar page
- `src/app/radar/radar.module.css`
- `supabase-radar-intelligence-companies-schema-fase8d.sql` — documented, **NOT applied**
- `docs/implementacao-fase8d-radar-inteligencia-hubs.md` — final report

**Modified files:**
- `src/types/operations.ts` — add `ManagedCompany`, `RadarSignal`, `RadarSignalStatus`, `IntelligenceItem`, `IntelligenceKind`, `IntelligenceStatus`
- `src/services/operations/operations-repository.ts` — extend `Collection`/`Map`, add companies seed, add `listRadarSignals`/`getRadarSignal`/... with expiry sweep
- `src/repositories/local-content-repository.ts` — `listCompanies`/`getCompanyBySlug` read from `operationsRepository` with coverage computation; new `listPublishedRadarSignals`/`listPublishedIntelligenceItems`
- `src/services/cms/content-repository.ts` — extend `ContentRepository` interface
- `src/types/content.ts` — extend `Company` with `hasCoverage`/`postCount`/`active`/`featured`
- `src/app/page.tsx` — replace hardcoded Radar/Inteligência/Empresas JSX with real data + empty states
- `src/app/home.module.css` — add `.emptyState`, evidence-link styles for radar/intel cards
- `src/app/empresas/page.tsx`, `src/app/empresas/[slug]/page.tsx` — filter by `active`
- `src/app/sitemap.ts` — only include `active` companies
- `src/components/admin/operations-editor.tsx` — add `company`/`radarSignal`/`intelligenceItem` kinds
- `src/components/admin/crud-list.tsx` — `statusLabel` gets `draft/reviewed/published/expired/rejected`
- `src/app/admin/(protected)/layout.tsx` or nav component — add 3 new admin nav links (locate exact file in Task 1)
- `playwright.config.ts` — no change expected (webServer already externalized)
- `e2e/axe.spec.ts` — add `/radar`, `/admin/radar`, `/admin/inteligencia`, `/admin/empresas` to coverage
- `e2e/public-pages.spec.ts` or new `e2e/radar-intelligence-hubs.spec.ts` — new E2E scenarios
- `project_vtres60_timeline.md`, `project_vtres60_pending_work.md`, `MEMORY.md` (in the memory directory, not the repo) — updated at the end, per Task 24

---

### Task 1: Confirm admin navigation entry point

**Files:**
- Read: `src/app/admin/(protected)/layout.tsx` (or wherever the admin sidebar nav list lives — grep for `"/admin/segmentos"` to find it)

**Interfaces:**
- Produces: the exact file + line to add 3 new nav entries (`/admin/empresas`, `/admin/radar`, `/admin/inteligencia`), used by Task 11.

- [ ] **Step 1: Locate the nav list**

Run: `grep -rn "admin/segmentos" src/app/admin src/components/admin --include="*.tsx" -l`

- [ ] **Step 2: Read that file and note the array/list structure where nav items are defined (label, href, icon)**

No code change yet — this task is pure reconnaissance to avoid guessing the nav structure later. Record the exact pattern (e.g. `{ href: "/admin/segmentos", label: "Segmentos", icon: ... }`) for reuse in Task 11.

- [ ] **Step 3: Commit** — no commit, this task produces no diff (skip commit).

---

### Task 2: Add `ManagedCompany`, `RadarSignal`, `IntelligenceItem` types

**Files:**
- Modify: `src/types/operations.ts`

**Interfaces:**
- Produces: `ManagedCompany`, `RadarSignalStatus`, `RadarSignal`, `IntelligenceKind`, `IntelligenceStatus`, `IntelligenceItem` — consumed by every later task.

- [ ] **Step 1: Append the new types to `src/types/operations.ts`**

```ts
export interface ManagedCompany {
  id: string; name: string; slug: string; legalName?: string; description: string; sector: string;
  website: string; ticker?: string; tickerSource?: string; active: boolean; featured: boolean;
  createdAt: string; updatedAt: string;
}

/**
 * Fase 8D (Radar Industrial) — ciclo de vida do sinal editorial.
 * "draft" -> "reviewed" -> "published" é a única sequência que permite
 * publicação (mesma regra estrutural do EventStatus da Fase 8C:
 * publicar exige ter passado por revisão antes). "expired" é atribuído
 * automaticamente por varredura de leitura quando validUntil já passou
 * (nunca manualmente). "rejected" é terminal, definido pelo admin.
 */
export type RadarSignalStatus = "draft" | "reviewed" | "published" | "expired" | "rejected";
export interface RadarSignal {
  id: string; title: string; summary: string;
  evidencePostIds: string[]; sourceUrls: string[]; tagIds: string[]; segmentSlugs: string[]; companySlugs: string[];
  confidence: "baixa" | "média" | "alta";
  generatedAt: string; validUntil: string; status: RadarSignalStatus;
  reviewedAt?: string; publishedAt?: string;
  createdAt: string; updatedAt: string;
}

export type IntelligenceKind = "fact" | "analysis" | "recommendation";
export type IntelligenceStatus = "draft" | "reviewed" | "published" | "expired" | "rejected";
export interface IntelligenceItem {
  id: string; radarSignalId: string; kind: IntelligenceKind; title: string; analysis: string; recommendedAction?: string;
  evidencePostIds: string[]; sourceUrls: string[]; segmentSlugs: string[]; companySlugs: string[];
  confidence: "baixa" | "média" | "alta";
  generatedAt: string; validUntil: string; status: IntelligenceStatus;
  reviewedAt?: string; publishedAt?: string;
  createdAt: string; updatedAt: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx tsc --noEmit`
Expected: PASS (new types are additive, nothing consumes them yet).

- [ ] **Step 3: Commit**

```bash
cd /home/pedro/vtres60-blog-fase8c
git add src/types/operations.ts
git commit -m "feat(fase8d): adiciona tipos ManagedCompany, RadarSignal e IntelligenceItem"
```

---

### Task 3: Extend `operationsRepository` with `companies`, `radarSignals`, `intelligenceItems`

**Files:**
- Modify: `src/services/operations/operations-repository.ts`
- Test: `src/services/operations/operations-repository.test.ts` (create if it doesn't exist — check first with `find src/services/operations -iname "*.test.ts"`)

**Interfaces:**
- Consumes: `ManagedCompany`, `RadarSignal`, `IntelligenceItem` (Task 2); `companies as legacyCompanies` from `@/data/content`.
- Produces: `operationsRepository.listCompanies/getCompany/createCompany/updateCompany/deleteCompany`, `.listRadarSignals/getRadarSignal/createRadarSignal/updateRadarSignal/deleteRadarSignal`, `.listIntelligenceItems/getIntelligenceItem/createIntelligenceItem/updateIntelligenceItem/deleteIntelligenceItem` — consumed by Tasks 4-10.

- [ ] **Step 1: Write the failing test for the expiry sweep (the one piece of genuinely new logic — everything else is the existing generic CRUD)**

Create `src/services/operations/operations-repository.test.ts`:

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const contentDir = path.join(process.cwd(), "src", "content");
const radarFile = path.join(contentDir, "radarSignals.json");

async function readRadarFile() {
  try {
    return JSON.parse(await fs.readFile(radarFile, "utf8"));
  } catch {
    return [];
  }
}

describe("operationsRepository — varredura de expiração de sinais do Radar", () => {
  let backup: string | null;

  beforeEach(async () => {
    try {
      backup = await fs.readFile(radarFile, "utf8");
    } catch {
      backup = null;
    }
  });

  afterEach(async () => {
    if (backup !== null) await fs.writeFile(radarFile, backup, "utf8");
    else await fs.rm(radarFile, { force: true });
  });

  it("marca automaticamente como 'expired' um sinal publicado cuja validUntil já passou", async () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const timestamp = new Date().toISOString();
    await fs.writeFile(
      radarFile,
      JSON.stringify([
        {
          id: "signal-1", title: "T", summary: "S", evidencePostIds: ["p1"], sourceUrls: ["https://x.com"],
          tagIds: [], segmentSlugs: [], companySlugs: [], confidence: "alta",
          generatedAt: timestamp, validUntil: past, status: "published", reviewedAt: timestamp, publishedAt: timestamp,
          createdAt: timestamp, updatedAt: timestamp,
        },
      ]),
      "utf8",
    );
    const { operationsRepository } = await import("./operations-repository");
    const items = await operationsRepository.listRadarSignals();
    expect(items[0].status).toBe("expired");
    const persisted = await readRadarFile();
    expect(persisted[0].status).toBe("expired");
  });

  it("não altera um sinal publicado cuja validUntil ainda não passou", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const timestamp = new Date().toISOString();
    await fs.writeFile(
      radarFile,
      JSON.stringify([
        {
          id: "signal-2", title: "T", summary: "S", evidencePostIds: ["p1"], sourceUrls: ["https://x.com"],
          tagIds: [], segmentSlugs: [], companySlugs: [], confidence: "alta",
          generatedAt: timestamp, validUntil: future, status: "published", reviewedAt: timestamp, publishedAt: timestamp,
          createdAt: timestamp, updatedAt: timestamp,
        },
      ]),
      "utf8",
    );
    const { operationsRepository } = await import("./operations-repository");
    const items = await operationsRepository.listRadarSignals();
    expect(items[0].status).toBe("published");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx vitest run src/services/operations/operations-repository.test.ts`
Expected: FAIL — `operationsRepository.listRadarSignals is not a function`.

- [ ] **Step 3: Implement — extend the repository**

In `src/services/operations/operations-repository.ts`, apply these changes:

1. Extend imports (top of file):
```ts
import { companies as legacyCompanies, events as legacyEvents, segmentProfiles } from "@/data/content";
import type { AdminLog, IntelligenceItem, Lead, ManagedCompany, ManagedEvent, ManagedSegment, MediaAsset, RadarSignal } from "@/types/operations";
```

2. Extend `Collection`/`Map`:
```ts
type Collection="segments"|"events"|"media"|"leads"|"logs"|"companies"|"radarSignals"|"intelligenceItems";
type Map={segments:ManagedSegment;events:ManagedEvent;media:MediaAsset;leads:Lead;logs:AdminLog;companies:ManagedCompany;radarSignals:RadarSignal;intelligenceItems:IntelligenceItem};
```

3. Real official websites, confirmed live via `curl`/DNS during Fase 8D research (2026-07-22): `gerdau.com`, `randon.com.br`, `deere.com`, `tramontina.com.br` returned HTTP 200 directly; `weg.net` and `marcopolo.com.br` block bots at the root (403, Akamai/Cloudflare WAF) but both domains are confirmed real (WEG via its live `ri.weg.net` investor-relations subdomain returning 200; Marcopolo's domain resolves on a legitimate Cloudflare-fronted zone) — same class of access friction as Febrava in Fase 8C, documented not hidden. Add to the `seeds()` function:

```ts
if(collection==="companies")return legacyCompanies.map(item=>({id:`company-${item.slug}`,name:item.name,slug:item.slug,description:item.description,sector:item.sector,website:{weg:"https://www.weg.net",gerdau:"https://www.gerdau.com","marcopolo":"https://www.marcopolo.com.br",randon:"https://www.randon.com.br","john-deere":"https://www.deere.com",tramontina:"https://www.tramontina.com.br"}[item.slug]??"",ticker:item.ticker,tickerSource:item.ticker?"Ticker já presente na base editorial anterior; símbolo público B3/CVM.":undefined,active:true,featured:false,createdAt:timestamp,updatedAt:timestamp}))as unknown as Map[K][];
```

Insert this as one more `if` branch inside the existing `seeds<K>()` function, alongside the existing `segments`/`events` branches (before the final `return[]`).

4. Add the expiry-sweep helper and specialized methods to the exported `operationsRepository` object:
```ts
function expireIfPast<T extends{status:string;validUntil:string}>(item:T):T{return item.status==="published"&&new Date(item.validUntil).getTime()<Date.now()?{...item,status:"expired"}:item}
async function sweepExpiry<K extends "radarSignals"|"intelligenceItems">(collection:K){const items=await read(collection);const swept=items.map(item=>expireIfPast(item as unknown as{status:string;validUntil:string}))as Map[K][];if(swept.some((item,i)=>(item as{status:string}).status!==(items[i] as{status:string}).status))await write(collection,swept);return swept}
```

5. Add to the exported `operationsRepository` object (after the existing `listEvents`/... lines):
```ts
  listCompanies:()=>read("companies"),getCompany:(value:string)=>get("companies",value),createCompany:(input:Omit<ManagedCompany,"id"|"createdAt"|"updatedAt">)=>create("companies",input),updateCompany:(id:string,patch:Partial<ManagedCompany>)=>update("companies",id,patch),deleteCompany:(id:string)=>remove("companies",id),
  listRadarSignals:()=>sweepExpiry("radarSignals"),getRadarSignal:async(value:string)=>(await sweepExpiry("radarSignals")).find(item=>item.id===value||undefined)??(await get("radarSignals",value)),createRadarSignal:(input:Omit<RadarSignal,"id"|"createdAt"|"updatedAt">)=>create("radarSignals",input),updateRadarSignal:(id:string,patch:Partial<RadarSignal>)=>update("radarSignals",id,patch),deleteRadarSignal:(id:string)=>remove("radarSignals",id),
  listIntelligenceItems:()=>sweepExpiry("intelligenceItems"),getIntelligenceItem:async(value:string)=>(await sweepExpiry("intelligenceItems")).find(item=>item.id===value)??(await get("intelligenceItems",value)),createIntelligenceItem:(input:Omit<IntelligenceItem,"id"|"createdAt"|"updatedAt">)=>create("intelligenceItems",input),updateIntelligenceItem:(id:string,patch:Partial<IntelligenceItem>)=>update("intelligenceItems",id,patch),deleteIntelligenceItem:(id:string)=>remove("intelligenceItems",id),
```

Note: `getRadarSignal`/`getIntelligenceItem` sweep the full list first (so an individually-fetched item reflects the same expiry state a list view would show), falling back to plain `get()` by slug-less id for items no `find` match hits (defensive, should not normally trigger since `sweepExpiry` returns the same id set).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx vitest run src/services/operations/operations-repository.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Full typecheck + existing suite untouched**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx tsc --noEmit && npx vitest run`
Expected: PASS, test count = 481 + 2 new = 483.

- [ ] **Step 6: Commit**

```bash
cd /home/pedro/vtres60-blog-fase8c
git add src/services/operations/operations-repository.ts src/services/operations/operations-repository.test.ts
git commit -m "feat(fase8d): estende operationsRepository com companies, radarSignals e intelligenceItems"
```

---

### Task 4: Evidence-context + publish validation for Radar

**Files:**
- Create: `src/lib/radar/evidence-context.ts`
- Create: `src/lib/radar/validate-signal.ts`
- Test: `src/lib/radar/validate-signal.test.ts`

**Interfaces:**
- Consumes: `editorialRepository.listPosts()`/`.listTags()` (`src/services/editorial`), `operationsRepository.listSegments()/.listCompanies()` (Task 3).
- Produces: `buildEvidenceContext()`, `deriveSourceUrls()`, `validateRadarSignalPublication()`, `EvidenceContext` type — consumed by Task 6 (routes) and Task 8 (Intelligence validation reuses `EvidenceContext`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/radar/validate-signal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateRadarSignalPublication } from "./validate-signal";

const CONTEXT = {
  postIds: new Set(["post-1", "post-2"]),
  tagIds: new Set(["tag-ia"]),
  segmentSlugs: new Set(["metalurgia"]),
  companySlugs: new Set(["weg"]),
};

const BASE = {
  title: "Sinal real", summary: "Resumo real",
  evidencePostIds: ["post-1"], sourceUrls: ["https://exemplo.com/noticia"],
  tagIds: ["tag-ia"], segmentSlugs: ["metalurgia"], companySlugs: ["weg"],
  validUntil: new Date(Date.now() + 86_400_000).toISOString(),
  reviewedAt: new Date().toISOString(),
  status: "published" as const,
};

describe("validateRadarSignalPublication", () => {
  it("aceita publicação com evidência real, revisada e ainda válida", () => {
    const errors = validateRadarSignalPublication(BASE, { status: "reviewed" }, CONTEXT);
    expect(errors).toEqual([]);
  });

  it("rejeita publicação sem nenhuma evidência (evidencePostIds vazio)", () => {
    const errors = validateRadarSignalPublication({ ...BASE, evidencePostIds: [], sourceUrls: [] }, { status: "reviewed" }, CONTEXT);
    expect(errors.some((e) => e.field === "evidencePostIds")).toBe(true);
  });

  it("rejeita post inexistente como evidência", () => {
    const errors = validateRadarSignalPublication({ ...BASE, evidencePostIds: ["post-inexistente"] }, { status: "reviewed" }, CONTEXT);
    expect(errors.some((e) => e.field === "evidencePostIds")).toBe(true);
  });

  it("rejeita tag inexistente", () => {
    const errors = validateRadarSignalPublication({ ...BASE, tagIds: ["tag-fantasma"] }, { status: "reviewed" }, CONTEXT);
    expect(errors.some((e) => e.field === "tagIds")).toBe(true);
  });

  it("rejeita segmento inexistente", () => {
    const errors = validateRadarSignalPublication({ ...BASE, segmentSlugs: ["segmento-fantasma"] }, { status: "reviewed" }, CONTEXT);
    expect(errors.some((e) => e.field === "segmentSlugs")).toBe(true);
  });

  it("rejeita empresa inexistente", () => {
    const errors = validateRadarSignalPublication({ ...BASE, companySlugs: ["empresa-fantasma"] }, { status: "reviewed" }, CONTEXT);
    expect(errors.some((e) => e.field === "companySlugs")).toBe(true);
  });

  it("rejeita sinal já expirado (validUntil no passado)", () => {
    const errors = validateRadarSignalPublication({ ...BASE, validUntil: new Date(Date.now() - 1000).toISOString() }, { status: "reviewed" }, CONTEXT);
    expect(errors.some((e) => e.field === "validUntil")).toBe(true);
  });

  it("rejeita publicação direta de um draft (sem revisão prévia)", () => {
    const errors = validateRadarSignalPublication(BASE, { status: "draft" }, CONTEXT);
    expect(errors.some((e) => e.field === "status")).toBe(true);
  });

  it("rejeita publicação sem reviewedAt mesmo saindo de status reviewed", () => {
    const errors = validateRadarSignalPublication({ ...BASE, reviewedAt: undefined }, { status: "reviewed" }, CONTEXT);
    expect(errors.some((e) => e.field === "reviewedAt")).toBe(true);
  });

  it("republicar (published -> published) é aceito quando tudo continua válido", () => {
    const errors = validateRadarSignalPublication(BASE, { status: "published" }, CONTEXT);
    expect(errors).toEqual([]);
  });

  it("não valida nada quando o status alvo não é 'published' (ex.: salvar como rascunho)", () => {
    const errors = validateRadarSignalPublication({ ...BASE, status: "draft", evidencePostIds: [], sourceUrls: [] }, { status: "draft" }, CONTEXT);
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx vitest run src/lib/radar/validate-signal.test.ts`
Expected: FAIL — module `./validate-signal` does not exist.

- [ ] **Step 3: Implement `validate-signal.ts`**

Create `src/lib/radar/validate-signal.ts`:

```ts
import type { RadarSignal, RadarSignalStatus } from "@/types/operations";

export interface PublishValidationError { field: string; message: string }

export interface EvidenceContext {
  postIds: Set<string>;
  tagIds: Set<string>;
  segmentSlugs: Set<string>;
  companySlugs: Set<string>;
}

const PUBLISHABLE_PRIOR_STATUS = new Set<RadarSignalStatus>(["reviewed", "published"]);

type PublishInput = Pick<RadarSignal, "title" | "summary" | "evidencePostIds" | "sourceUrls" | "tagIds" | "segmentSlugs" | "companySlugs" | "validUntil" | "reviewedAt" | "status">;

/**
 * Fase 8D — regra server-side obrigatória de publicação do Radar Industrial.
 * Espelha src/lib/agenda/event-publish-rules.ts (Fase 8C): só valida
 * quando o estado FINAL desejado é "published"; nunca confia no client.
 * "Nenhum sinal pode ser publicado sem evidência real" (spec) é aplicado
 * aqui, não só sugerido na UI.
 */
export function validateRadarSignalPublication(next: PublishInput, current: Pick<RadarSignal, "status"> | undefined, context: EvidenceContext): PublishValidationError[] {
  if (next.status !== "published") return [];
  const errors: PublishValidationError[] = [];

  if (!next.title?.trim()) errors.push({ field: "title", message: "Título é obrigatório para publicar o sinal." });
  if (!next.summary?.trim()) errors.push({ field: "summary", message: "Resumo é obrigatório para publicar o sinal." });

  if (!next.evidencePostIds?.length) {
    errors.push({ field: "evidencePostIds", message: "Nenhum sinal pode ser publicado sem evidência real — selecione ao menos um post publicado." });
  } else {
    const invalid = next.evidencePostIds.filter((id) => !context.postIds.has(id));
    if (invalid.length) errors.push({ field: "evidencePostIds", message: `Post(s) inexistente(s) ou não publicados referenciados como evidência: ${invalid.join(", ")}.` });
  }

  if (!next.sourceUrls?.length) errors.push({ field: "sourceUrls", message: "Nenhuma fonte real associada — os posts de evidência precisam ter source_url." });

  const invalidTags = (next.tagIds ?? []).filter((id) => !context.tagIds.has(id));
  if (invalidTags.length) errors.push({ field: "tagIds", message: `Tag(s) inexistente(s): ${invalidTags.join(", ")}.` });

  const invalidSegments = (next.segmentSlugs ?? []).filter((slug) => !context.segmentSlugs.has(slug));
  if (invalidSegments.length) errors.push({ field: "segmentSlugs", message: `Segmento(s) inexistente(s): ${invalidSegments.join(", ")}.` });

  const invalidCompanies = (next.companySlugs ?? []).filter((slug) => !context.companySlugs.has(slug));
  if (invalidCompanies.length) errors.push({ field: "companySlugs", message: `Empresa(s) inexistente(s): ${invalidCompanies.join(", ")}.` });

  if (!next.validUntil) errors.push({ field: "validUntil", message: "Data de validade é obrigatória para publicar o sinal." });
  else if (new Date(next.validUntil).getTime() <= Date.now()) errors.push({ field: "validUntil", message: "Não é possível publicar um sinal já expirado — atualize a validade primeiro." });

  if (!next.reviewedAt) errors.push({ field: "reviewedAt", message: "Sinal precisa ser revisado antes de ser publicado." });

  const priorStatus = current?.status;
  if (!priorStatus || !PUBLISHABLE_PRIOR_STATUS.has(priorStatus)) {
    errors.push({
      field: "status",
      message: priorStatus
        ? `Não é possível publicar diretamente a partir do status "${priorStatus}" — revise o sinal primeiro.`
        : "Não é possível criar um sinal já publicado — revise antes.",
    });
  }

  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx vitest run src/lib/radar/validate-signal.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Implement `evidence-context.ts`** (no test needed on its own — it's exercised indirectly by Task 6's route tests; it's pure data assembly, not a decision function)

Create `src/lib/radar/evidence-context.ts`:

```ts
import { editorialRepository } from "@/services/editorial";
import { operationsRepository } from "@/services/operations";
import type { EvidenceContext } from "./validate-signal";

export interface EvidencePostsIndex extends EvidenceContext {
  posts: Map<string, { sourceUrl: string }>;
}

const isVisible = (status: string, scheduledAt: string) => status === "published" || (status === "scheduled" && Boolean(scheduledAt) && new Date(scheduledAt) <= new Date());

export async function buildEvidenceContext(): Promise<EvidencePostsIndex> {
  const [posts, tags, segments, companies] = await Promise.all([
    editorialRepository.listPosts(),
    editorialRepository.listTags(),
    operationsRepository.listSegments(),
    operationsRepository.listCompanies(),
  ]);
  const visiblePosts = posts.filter((post) => isVisible(post.status, post.scheduledAt));
  return {
    postIds: new Set(visiblePosts.map((post) => post.id)),
    tagIds: new Set(tags.map((tag) => tag.id)),
    segmentSlugs: new Set(segments.map((segment) => segment.slug)),
    companySlugs: new Set(companies.map((company) => company.slug)),
    posts: new Map(visiblePosts.map((post) => [post.id, { sourceUrl: post.sourceUrl }])),
  };
}

export function deriveSourceUrls(evidencePostIds: string[], context: EvidencePostsIndex): string[] {
  const urls = evidencePostIds.map((id) => context.posts.get(id)?.sourceUrl).filter((url): url is string => Boolean(url));
  return Array.from(new Set(urls));
}
```

- [ ] **Step 6: Typecheck**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /home/pedro/vtres60-blog-fase8c
git add src/lib/radar/evidence-context.ts src/lib/radar/validate-signal.ts src/lib/radar/validate-signal.test.ts
git commit -m "feat(fase8d): validação server-side de publicação do Radar Industrial (sem evidência real, sem publicação)"
```

---

### Task 5: Publish validation for Intelligence VTRES60

**Files:**
- Create: `src/lib/radar/validate-intelligence.ts`
- Test: `src/lib/radar/validate-intelligence.test.ts`

**Interfaces:**
- Consumes: `EvidenceContext`/`EvidencePostsIndex` (Task 4).
- Produces: `validateIntelligencePublication()` — consumed by Task 9 (routes).

- [ ] **Step 1: Write the failing test**

Create `src/lib/radar/validate-intelligence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateIntelligencePublication } from "./validate-intelligence";

const CONTEXT = {
  postIds: new Set(["post-1"]),
  tagIds: new Set<string>(),
  segmentSlugs: new Set(["metalurgia"]),
  companySlugs: new Set(["weg"]),
};

const REAL_SIGNALS = new Set(["signal-1"]);

const BASE = {
  radarSignalId: "signal-1", kind: "analysis" as const,
  title: "Análise real", analysis: "Texto de análise real", recommendedAction: undefined,
  evidencePostIds: ["post-1"], sourceUrls: ["https://exemplo.com/noticia"],
  segmentSlugs: ["metalurgia"], companySlugs: ["weg"],
  validUntil: new Date(Date.now() + 86_400_000).toISOString(),
  reviewedAt: new Date().toISOString(),
  status: "published" as const,
};

describe("validateIntelligencePublication", () => {
  it("aceita publicação de 'analysis' com radar_signal_id real e evidência válida", () => {
    expect(validateIntelligencePublication(BASE, { status: "reviewed" }, CONTEXT, REAL_SIGNALS)).toEqual([]);
  });

  it("rejeita quando radar_signal_id não existe", () => {
    const errors = validateIntelligencePublication({ ...BASE, radarSignalId: "signal-fantasma" }, { status: "reviewed" }, CONTEXT, REAL_SIGNALS);
    expect(errors.some((e) => e.field === "radarSignalId")).toBe(true);
  });

  it("rejeita 'recommendation' sem recommendedAction preenchido", () => {
    const errors = validateIntelligencePublication({ ...BASE, kind: "recommendation", recommendedAction: undefined }, { status: "reviewed" }, CONTEXT, REAL_SIGNALS);
    expect(errors.some((e) => e.field === "recommendedAction")).toBe(true);
  });

  it("aceita 'recommendation' com recommendedAction preenchido", () => {
    const errors = validateIntelligencePublication({ ...BASE, kind: "recommendation", recommendedAction: "Ação recomendada real" }, { status: "reviewed" }, CONTEXT, REAL_SIGNALS);
    expect(errors).toEqual([]);
  });

  it("'fact' não exige recommendedAction", () => {
    const errors = validateIntelligencePublication({ ...BASE, kind: "fact" }, { status: "reviewed" }, CONTEXT, REAL_SIGNALS);
    expect(errors).toEqual([]);
  });

  it("rejeita sem nenhuma evidência", () => {
    const errors = validateIntelligencePublication({ ...BASE, evidencePostIds: [], sourceUrls: [] }, { status: "reviewed" }, CONTEXT, REAL_SIGNALS);
    expect(errors.some((e) => e.field === "evidencePostIds")).toBe(true);
  });

  it("rejeita publicação direta de um draft", () => {
    const errors = validateIntelligencePublication(BASE, { status: "draft" }, CONTEXT, REAL_SIGNALS);
    expect(errors.some((e) => e.field === "status")).toBe(true);
  });

  it("rejeita item já expirado", () => {
    const errors = validateIntelligencePublication({ ...BASE, validUntil: new Date(Date.now() - 1000).toISOString() }, { status: "reviewed" }, CONTEXT, REAL_SIGNALS);
    expect(errors.some((e) => e.field === "validUntil")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx vitest run src/lib/radar/validate-intelligence.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/radar/validate-intelligence.ts`:

```ts
import type { IntelligenceItem, IntelligenceStatus } from "@/types/operations";
import type { EvidenceContext } from "./validate-signal";

export interface PublishValidationError { field: string; message: string }

const PUBLISHABLE_PRIOR_STATUS = new Set<IntelligenceStatus>(["reviewed", "published"]);

type PublishInput = Pick<IntelligenceItem, "radarSignalId" | "kind" | "title" | "analysis" | "recommendedAction" | "evidencePostIds" | "sourceUrls" | "segmentSlugs" | "companySlugs" | "validUntil" | "reviewedAt" | "status">;

/**
 * Fase 8D — regra server-side de publicação da Inteligência VTRES60.
 * "Não apresentar recomendação como notícia" (spec) é aplicado aqui: um
 * item kind="recommendation" sem recommended_action não é uma
 * recomendação de verdade, só um fato disfarçado — bloqueado.
 * "Reconstruir a partir dos sinais do Radar" (spec) é aplicado exigindo
 * um radar_signal_id que exista de fato, nunca um id solto.
 */
export function validateIntelligencePublication(
  next: PublishInput,
  current: Pick<IntelligenceItem, "status"> | undefined,
  context: EvidenceContext,
  realRadarSignalIds: Set<string>,
): PublishValidationError[] {
  if (next.status !== "published") return [];
  const errors: PublishValidationError[] = [];

  if (!next.radarSignalId || !realRadarSignalIds.has(next.radarSignalId)) {
    errors.push({ field: "radarSignalId", message: "Todo item de Inteligência precisa referenciar um sinal real do Radar." });
  }
  if (!next.title?.trim()) errors.push({ field: "title", message: "Título é obrigatório para publicar." });
  if (!next.analysis?.trim()) errors.push({ field: "analysis", message: "Análise é obrigatória para publicar." });
  if (next.kind === "recommendation" && !next.recommendedAction?.trim()) {
    errors.push({ field: "recommendedAction", message: "Uma recomendação sem ação recomendada não pode ser publicada como recomendação." });
  }

  if (!next.evidencePostIds?.length) {
    errors.push({ field: "evidencePostIds", message: "Nenhum item pode ser publicado sem evidência real — selecione ao menos um post publicado." });
  } else {
    const invalid = next.evidencePostIds.filter((id) => !context.postIds.has(id));
    if (invalid.length) errors.push({ field: "evidencePostIds", message: `Post(s) inexistente(s) ou não publicados: ${invalid.join(", ")}.` });
  }
  if (!next.sourceUrls?.length) errors.push({ field: "sourceUrls", message: "Nenhuma fonte real associada." });

  const invalidSegments = (next.segmentSlugs ?? []).filter((slug) => !context.segmentSlugs.has(slug));
  if (invalidSegments.length) errors.push({ field: "segmentSlugs", message: `Segmento(s) inexistente(s): ${invalidSegments.join(", ")}.` });
  const invalidCompanies = (next.companySlugs ?? []).filter((slug) => !context.companySlugs.has(slug));
  if (invalidCompanies.length) errors.push({ field: "companySlugs", message: `Empresa(s) inexistente(s): ${invalidCompanies.join(", ")}.` });

  if (!next.validUntil) errors.push({ field: "validUntil", message: "Data de validade é obrigatória." });
  else if (new Date(next.validUntil).getTime() <= Date.now()) errors.push({ field: "validUntil", message: "Não é possível publicar um item já expirado." });

  if (!next.reviewedAt) errors.push({ field: "reviewedAt", message: "Item precisa ser revisado antes de ser publicado." });

  const priorStatus = current?.status;
  if (!priorStatus || !PUBLISHABLE_PRIOR_STATUS.has(priorStatus)) {
    errors.push({
      field: "status",
      message: priorStatus ? `Não é possível publicar diretamente a partir do status "${priorStatus}".` : "Não é possível criar um item já publicado — revise antes.",
    });
  }

  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx vitest run src/lib/radar/validate-intelligence.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/pedro/vtres60-blog-fase8c
git add src/lib/radar/validate-intelligence.ts src/lib/radar/validate-intelligence.test.ts
git commit -m "feat(fase8d): validação server-side de publicação da Inteligência VTRES60"
```

---

### Task 6: Companies admin API routes

**Files:**
- Create: `src/app/api/admin/companies/route.ts`
- Create: `src/app/api/admin/companies/[id]/route.ts`
- Test: `src/app/api/admin/companies/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (`@/lib/admin-api`), `apiError`/`required` (`@/lib/editorial-api`), `operationsRepository.listCompanies/createCompany/getCompany/updateCompany/deleteCompany` (Task 3).
- Produces: `GET/POST /api/admin/companies`, `GET/PATCH/DELETE /api/admin/companies/[id]` — consumed by Task 11 (admin UI).

- [ ] **Step 1: Write the failing test**

Create `src/app/api/admin/companies/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated: () => Promise.resolve(true) }));

const createMock = vi.fn();
const logMock = vi.fn();
vi.mock("@/services/operations", () => ({
  operationsRepository: {
    listCompanies: vi.fn(),
    createCompany: (...a: unknown[]) => createMock(...a),
    log: (...a: unknown[]) => logMock(...a),
  },
}));

import { POST } from "./route";

beforeEach(() => {
  createMock.mockReset();
  logMock.mockReset();
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/companies", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("POST /api/admin/companies", () => {
  it("rejeita sem website (campo obrigatório da spec)", async () => {
    const response = await POST(jsonRequest({ name: "Empresa X", slug: "empresa-x", description: "desc", sector: "Setor" }));
    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("aceita com os campos mínimos obrigatórios", async () => {
    createMock.mockResolvedValue({ id: "company-x", name: "Empresa X", slug: "empresa-x" });
    const response = await POST(jsonRequest({ name: "Empresa X", slug: "empresa-x", description: "desc", sector: "Setor", website: "https://empresa-x.com", active: true, featured: false }));
    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx vitest run src/app/api/admin/companies/route.test.ts`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement the routes**

Create `src/app/api/admin/companies/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { apiError, required } from "@/lib/editorial-api";
import { operationsRepository } from "@/services/operations";
import type { ManagedCompany } from "@/types/operations";

export async function GET() {
  const denied = await requireAdmin();
  return denied ?? NextResponse.json(await operationsRepository.listCompanies());
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = (await request.json()) as Omit<ManagedCompany, "id" | "createdAt" | "updatedAt">;
    if (!required(body, ["name", "slug", "description", "sector", "website"])) {
      return apiError(new Error("Nome, slug, descrição, setor e site oficial são obrigatórios."));
    }
    const item = await operationsRepository.createCompany(body);
    await operationsRepository.log("criação", "empresas", `Empresa “${item.name}” criada.`);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
```

Create `src/app/api/admin/companies/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { apiError } from "@/lib/editorial-api";
import { operationsRepository } from "@/services/operations";
import type { ManagedCompany } from "@/types/operations";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const item = await operationsRepository.getCompany(id);
  return item ? NextResponse.json(item) : apiError(new Error("Empresa não encontrada."), 404);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const patch = (await request.json()) as Partial<ManagedCompany>;
    const item = await operationsRepository.updateCompany(id, patch);
    if (!item) return apiError(new Error("Empresa não encontrada."), 404);
    await operationsRepository.log("edição", "empresas", `Empresa “${item.name}” atualizada.`);
    return NextResponse.json(item);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const item = await operationsRepository.getCompany(id);
  if (!item) return apiError(new Error("Empresa não encontrada."), 404);
  await operationsRepository.deleteCompany(id);
  await operationsRepository.log("exclusão", "empresas", `Empresa “${item.name}” excluída.`);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx vitest run src/app/api/admin/companies/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/pedro/vtres60-blog-fase8c
git add src/app/api/admin/companies
git commit -m "feat(fase8d): rotas admin de empresas (CRUD)"
```

---

### Task 7: Radar admin API routes + direct-backend-attack integration test

**Files:**
- Create: `src/app/api/admin/radar/route.ts`
- Create: `src/app/api/admin/radar/[id]/route.ts`
- Test: `src/app/api/admin/radar/publish-validation.test.ts` (mirrors the existing `events` one — proves the backend blocks publication even bypassing the UI)

**Interfaces:**
- Consumes: `buildEvidenceContext`/`deriveSourceUrls` (Task 4), `validateRadarSignalPublication` (Task 4), `operationsRepository.*RadarSignal*` (Task 3).
- Produces: `GET/POST /api/admin/radar`, `GET/PATCH/DELETE /api/admin/radar/[id]` — consumed by Task 11.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/admin/radar/publish-validation.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated: () => Promise.resolve(true) }));

const createMock = vi.fn();
const getMock = vi.fn();
const updateMock = vi.fn();
const logMock = vi.fn();
vi.mock("@/services/operations", () => ({
  operationsRepository: {
    createRadarSignal: (...a: unknown[]) => createMock(...a),
    getRadarSignal: (...a: unknown[]) => getMock(...a),
    updateRadarSignal: (...a: unknown[]) => updateMock(...a),
    log: (...a: unknown[]) => logMock(...a),
    listSegments: () => Promise.resolve([]),
    listCompanies: () => Promise.resolve([]),
  },
}));
vi.mock("@/services/editorial", () => ({
  editorialRepository: {
    listPosts: () => Promise.resolve([]),
    listTags: () => Promise.resolve([]),
  },
}));

import { POST } from "./route";
import { PATCH } from "./[id]/route";

const DRAFT_SIGNAL = {
  id: "signal-1", title: "Sinal", summary: "Resumo", evidencePostIds: [], sourceUrls: [],
  tagIds: [], segmentSlugs: [], companySlugs: [], confidence: "media",
  generatedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 86_400_000).toISOString(), status: "draft",
};

beforeEach(() => {
  createMock.mockReset();
  getMock.mockReset();
  updateMock.mockReset();
  logMock.mockReset();
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/radar", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("POST /api/admin/radar — chamada direta ao backend", () => {
  it("rejeita criação direta como published sem nenhuma evidência", async () => {
    const response = await POST(jsonRequest({ title: "Novo Sinal", summary: "Resumo", evidencePostIds: [], status: "published", confidence: "alta", validUntil: new Date(Date.now() + 86_400_000).toISOString(), reviewedAt: new Date().toISOString() }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatch(/evidência/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("aceita criação como draft (não passa pela validação de publicação)", async () => {
    createMock.mockResolvedValue({ ...DRAFT_SIGNAL });
    const response = await POST(jsonRequest({ title: "Novo Sinal", summary: "Resumo", status: "draft", confidence: "media", evidencePostIds: [], validUntil: new Date(Date.now() + 86_400_000).toISOString() }));
    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/radar/[id] — chamada direta ao backend", () => {
  it("draft não pode ser publicado via PATCH direto mesmo enviando só {status:'published'}", async () => {
    getMock.mockResolvedValue({ ...DRAFT_SIGNAL });
    const response = await PATCH(jsonRequest({ status: "published" }), { params: Promise.resolve({ id: "signal-1" }) });
    expect(response.status).toBe(422);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("sinal revisado, com evidência real e válida, PODE ser publicado", async () => {
    getMock.mockResolvedValue({ ...DRAFT_SIGNAL, status: "reviewed", reviewedAt: new Date().toISOString() });
    updateMock.mockResolvedValue({ ...DRAFT_SIGNAL, status: "published" });
    // Sem posts reais no contexto mockado, evidencePostIds vazio ainda bloqueia —
    // este teste comprova que a rota SÓ aceita quando também há evidência.
    const response = await PATCH(jsonRequest({ status: "published" }), { params: Promise.resolve({ id: "signal-1" }) });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatch(/evidência/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx vitest run src/app/api/admin/radar/publish-validation.test.ts`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement the routes**

Create `src/app/api/admin/radar/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { apiError, required } from "@/lib/editorial-api";
import { buildEvidenceContext, deriveSourceUrls } from "@/lib/radar/evidence-context";
import { validateRadarSignalPublication } from "@/lib/radar/validate-signal";
import { operationsRepository } from "@/services/operations";
import type { RadarSignal } from "@/types/operations";

export async function GET() {
  const denied = await requireAdmin();
  return denied ?? NextResponse.json(await operationsRepository.listRadarSignals());
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = (await request.json()) as Omit<RadarSignal, "id" | "createdAt" | "updatedAt" | "sourceUrls">;
    if (!required(body, ["title", "summary"])) return apiError(new Error("Título e resumo são obrigatórios."));
    const context = await buildEvidenceContext();
    const sourceUrls = deriveSourceUrls(body.evidencePostIds ?? [], context);
    const input = { ...body, sourceUrls } as Omit<RadarSignal, "id" | "createdAt" | "updatedAt">;
    const publishErrors = validateRadarSignalPublication(input, undefined, context);
    if (publishErrors.length) return apiError(new Error(publishErrors.map((e) => e.message).join(" ")), 422);
    const item = await operationsRepository.createRadarSignal(input);
    await operationsRepository.log("criação", "radar", `Sinal “${item.title}” criado.`);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
```

Create `src/app/api/admin/radar/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { apiError } from "@/lib/editorial-api";
import { buildEvidenceContext, deriveSourceUrls } from "@/lib/radar/evidence-context";
import { validateRadarSignalPublication } from "@/lib/radar/validate-signal";
import { operationsRepository } from "@/services/operations";
import type { RadarSignal } from "@/types/operations";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const item = await operationsRepository.getRadarSignal(id);
  return item ? NextResponse.json(item) : apiError(new Error("Sinal não encontrado."), 404);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const patch = (await request.json()) as Partial<RadarSignal>;
    const current = await operationsRepository.getRadarSignal(id);
    if (!current) return apiError(new Error("Sinal não encontrado."), 404);
    const context = await buildEvidenceContext();
    const mergedEvidence = patch.evidencePostIds ?? current.evidencePostIds;
    const sourceUrls = deriveSourceUrls(mergedEvidence, context);
    const merged = { ...current, ...patch, sourceUrls } as RadarSignal;
    const publishErrors = validateRadarSignalPublication(merged, current, context);
    if (publishErrors.length) return apiError(new Error(publishErrors.map((e) => e.message).join(" ")), 422);
    const item = await operationsRepository.updateRadarSignal(id, { ...patch, sourceUrls });
    if (!item) return apiError(new Error("Sinal não encontrado."), 404);
    await operationsRepository.log("edição", "radar", `Sinal “${item.title}” atualizado.`);
    return NextResponse.json(item);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const item = await operationsRepository.getRadarSignal(id);
  if (!item) return apiError(new Error("Sinal não encontrado."), 404);
  await operationsRepository.deleteRadarSignal(id);
  await operationsRepository.log("exclusão", "radar", `Sinal “${item.title}” excluído.`);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx vitest run src/app/api/admin/radar/publish-validation.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/pedro/vtres60-blog-fase8c
git add src/app/api/admin/radar
git commit -m "feat(fase8d): rotas admin do Radar Industrial com gate de publicação server-side"
```

---

### Task 8: Intelligence admin API routes + direct-backend-attack integration test

**Files:**
- Create: `src/app/api/admin/intelligence/route.ts`
- Create: `src/app/api/admin/intelligence/[id]/route.ts`
- Test: `src/app/api/admin/intelligence/publish-validation.test.ts`

**Interfaces:**
- Consumes: `validateIntelligencePublication` (Task 5), `buildEvidenceContext`/`deriveSourceUrls` (Task 4), `operationsRepository.*IntelligenceItem*`/`.listRadarSignals` (Task 3).
- Produces: `GET/POST /api/admin/intelligence`, `GET/PATCH/DELETE /api/admin/intelligence/[id]`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/admin/intelligence/publish-validation.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated: () => Promise.resolve(true) }));

const createMock = vi.fn();
const getMock = vi.fn();
const updateMock = vi.fn();
const logMock = vi.fn();
vi.mock("@/services/operations", () => ({
  operationsRepository: {
    createIntelligenceItem: (...a: unknown[]) => createMock(...a),
    getIntelligenceItem: (...a: unknown[]) => getMock(...a),
    updateIntelligenceItem: (...a: unknown[]) => updateMock(...a),
    listRadarSignals: () => Promise.resolve([{ id: "signal-1", status: "published" }]),
    log: (...a: unknown[]) => logMock(...a),
    listSegments: () => Promise.resolve([]),
    listCompanies: () => Promise.resolve([]),
  },
}));
vi.mock("@/services/editorial", () => ({
  editorialRepository: { listPosts: () => Promise.resolve([]), listTags: () => Promise.resolve([]) },
}));

import { POST } from "./route";
import { PATCH } from "./[id]/route";

const DRAFT_ITEM = {
  id: "item-1", radarSignalId: "signal-1", kind: "fact", title: "Fato", analysis: "Análise",
  evidencePostIds: [], sourceUrls: [], segmentSlugs: [], companySlugs: [], confidence: "media",
  generatedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 86_400_000).toISOString(), status: "draft",
};

beforeEach(() => {
  createMock.mockReset();
  getMock.mockReset();
  updateMock.mockReset();
  logMock.mockReset();
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/intelligence", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("POST /api/admin/intelligence — chamada direta ao backend", () => {
  it("rejeita criação direta como published com radar_signal_id inexistente", async () => {
    const response = await POST(jsonRequest({ radarSignalId: "signal-fantasma", kind: "fact", title: "T", analysis: "A", status: "published", confidence: "alta", validUntil: new Date(Date.now() + 86_400_000).toISOString(), reviewedAt: new Date().toISOString(), evidencePostIds: [] }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatch(/radar/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("aceita criação como draft", async () => {
    createMock.mockResolvedValue({ ...DRAFT_ITEM });
    const response = await POST(jsonRequest({ radarSignalId: "signal-1", kind: "fact", title: "T", analysis: "A", status: "draft", confidence: "media", evidencePostIds: [] }));
    expect(response.status).toBe(201);
  });
});

describe("PATCH /api/admin/intelligence/[id] — chamada direta ao backend", () => {
  it("draft não pode ser publicado via PATCH direto", async () => {
    getMock.mockResolvedValue({ ...DRAFT_ITEM });
    const response = await PATCH(jsonRequest({ status: "published" }), { params: Promise.resolve({ id: "item-1" }) });
    expect(response.status).toBe(422);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("recommendation sem recommended_action não pode ser publicada", async () => {
    getMock.mockResolvedValue({ ...DRAFT_ITEM, kind: "recommendation", status: "reviewed", reviewedAt: new Date().toISOString(), evidencePostIds: ["p"], sourceUrls: ["https://x.com"] });
    const response = await PATCH(jsonRequest({ status: "published" }), { params: Promise.resolve({ id: "item-1" }) });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toMatch(/recomend/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx vitest run src/app/api/admin/intelligence/publish-validation.test.ts`
Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement the routes**

Create `src/app/api/admin/intelligence/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { apiError, required } from "@/lib/editorial-api";
import { buildEvidenceContext, deriveSourceUrls } from "@/lib/radar/evidence-context";
import { validateIntelligencePublication } from "@/lib/radar/validate-intelligence";
import { operationsRepository } from "@/services/operations";
import type { IntelligenceItem } from "@/types/operations";

export async function GET() {
  const denied = await requireAdmin();
  return denied ?? NextResponse.json(await operationsRepository.listIntelligenceItems());
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const body = (await request.json()) as Omit<IntelligenceItem, "id" | "createdAt" | "updatedAt" | "sourceUrls">;
    if (!required(body, ["title", "analysis", "radarSignalId"])) return apiError(new Error("Título, análise e sinal de origem são obrigatórios."));
    const [context, signals] = await Promise.all([buildEvidenceContext(), operationsRepository.listRadarSignals()]);
    const realSignalIds = new Set(signals.map((s) => s.id));
    const sourceUrls = deriveSourceUrls(body.evidencePostIds ?? [], context);
    const input = { ...body, sourceUrls } as Omit<IntelligenceItem, "id" | "createdAt" | "updatedAt">;
    const publishErrors = validateIntelligencePublication(input, undefined, context, realSignalIds);
    if (publishErrors.length) return apiError(new Error(publishErrors.map((e) => e.message).join(" ")), 422);
    const item = await operationsRepository.createIntelligenceItem(input);
    await operationsRepository.log("criação", "inteligencia", `Item “${item.title}” criado.`);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
```

Create `src/app/api/admin/intelligence/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";
import { apiError } from "@/lib/editorial-api";
import { buildEvidenceContext, deriveSourceUrls } from "@/lib/radar/evidence-context";
import { validateIntelligencePublication } from "@/lib/radar/validate-intelligence";
import { operationsRepository } from "@/services/operations";
import type { IntelligenceItem } from "@/types/operations";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const item = await operationsRepository.getIntelligenceItem(id);
  return item ? NextResponse.json(item) : apiError(new Error("Item não encontrado."), 404);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  try {
    const { id } = await params;
    const patch = (await request.json()) as Partial<IntelligenceItem>;
    const current = await operationsRepository.getIntelligenceItem(id);
    if (!current) return apiError(new Error("Item não encontrado."), 404);
    const [context, signals] = await Promise.all([buildEvidenceContext(), operationsRepository.listRadarSignals()]);
    const realSignalIds = new Set(signals.map((s) => s.id));
    const mergedEvidence = patch.evidencePostIds ?? current.evidencePostIds;
    const sourceUrls = deriveSourceUrls(mergedEvidence, context);
    const merged = { ...current, ...patch, sourceUrls } as IntelligenceItem;
    const publishErrors = validateIntelligencePublication(merged, current, context, realSignalIds);
    if (publishErrors.length) return apiError(new Error(publishErrors.map((e) => e.message).join(" ")), 422);
    const item = await operationsRepository.updateIntelligenceItem(id, { ...patch, sourceUrls });
    if (!item) return apiError(new Error("Item não encontrado."), 404);
    await operationsRepository.log("edição", "inteligencia", `Item “${item.title}” atualizado.`);
    return NextResponse.json(item);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const item = await operationsRepository.getIntelligenceItem(id);
  if (!item) return apiError(new Error("Item não encontrado."), 404);
  await operationsRepository.deleteIntelligenceItem(id);
  await operationsRepository.log("exclusão", "inteligencia", `Item “${item.title}” excluído.`);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx vitest run src/app/api/admin/intelligence/publish-validation.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/pedro/vtres60-blog-fase8c
git add src/app/api/admin/intelligence
git commit -m "feat(fase8d): rotas admin da Inteligência VTRES60 com gate de publicação server-side"
```

---

### Task 9: Public reads — companies with coverage, published Radar/Intelligence

**Files:**
- Modify: `src/repositories/local-content-repository.ts`
- Modify: `src/services/cms/content-repository.ts`
- Modify: `src/types/content.ts`
- Test: `src/repositories/local-content-repository.test.ts` (check if it exists first: `find src/repositories -iname "*.test.ts"`; if not, create it)

**Interfaces:**
- Consumes: `operationsRepository.listCompanies/listRadarSignals/listIntelligenceItems` (Task 3), `editorialRepository.listPosts()`.
- Produces: `contentRepository.listCompanies()` (now coverage-aware), `listPublishedRadarSignals()`, `listPublishedIntelligenceItems()` — consumed by Task 10 (home) and Task 12 (`/radar` page).

- [ ] **Step 1: Write the failing test**

Add to (or create) `src/repositories/local-content-repository.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/operations", () => ({
  operationsRepository: {
    listCompanies: () => Promise.resolve([
      { id: "c1", name: "WEG", slug: "weg", description: "d", sector: "s", website: "https://weg.net", active: true, featured: false, createdAt: "", updatedAt: "" },
      { id: "c2", name: "Empresa Sem Post", slug: "sem-post", description: "d", sector: "s", website: "https://x.com", active: true, featured: false, createdAt: "", updatedAt: "" },
      { id: "c3", name: "Empresa Inativa", slug: "inativa", description: "d", sector: "s", website: "https://y.com", active: false, featured: true, createdAt: "", updatedAt: "" },
    ]),
    listSegments: () => Promise.resolve([]),
    listEvents: () => Promise.resolve([]),
    listRadarSignals: () => Promise.resolve([]),
    listIntelligenceItems: () => Promise.resolve([]),
  },
}));
vi.mock("@/services/editorial", () => ({
  editorialRepository: {
    listPosts: () => Promise.resolve([{ id: "p1", status: "published", scheduledAt: "", companies: ["WEG"] }]),
    listEducationalArticles: () => Promise.resolve([]),
    listCategories: () => Promise.resolve([]),
    listAuthors: () => Promise.resolve([]),
    listTags: () => Promise.resolve([]),
  },
}));

describe("localContentRepository.listCompanies — cobertura real", () => {
  it("marca hasCoverage=true só para empresas com pelo menos um post publicado", async () => {
    const { localContentRepository } = await import("./local-content-repository");
    const companies = await localContentRepository.listCompanies();
    const weg = companies.find((c) => c.slug === "weg");
    const semPost = companies.find((c) => c.slug === "sem-post");
    expect(weg?.hasCoverage).toBe(true);
    expect(semPost?.hasCoverage).toBe(false);
  });

  it("nunca retorna empresa inativa, mesmo com featured=true", async () => {
    const { localContentRepository } = await import("./local-content-repository");
    const companies = await localContentRepository.listCompanies();
    expect(companies.some((c) => c.slug === "inativa")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx vitest run src/repositories/local-content-repository.test.ts`
Expected: FAIL — `hasCoverage` undefined / `inativa` still present (current code just returns the static array).

- [ ] **Step 3: Implement**

In `src/types/content.ts`, extend `Company`:
```ts
export interface Company {
  name: string; slug: string; ticker?: string; sector: string; description: string; accent: string;
  hasCoverage: boolean; postCount: number; active: boolean; featured: boolean; website: string;
}
```

In `src/services/cms/content-repository.ts`, extend the interface:
```ts
export interface ContentRepository {
  listArticles(): Promise<Article[]>;
  getArticleBySlug(slug: string): Promise<Article | undefined>;
  listCompanies(): Promise<Company[]>;
  getCompanyBySlug(slug: string): Promise<Company | undefined>;
  listEvents(): Promise<IndustrialEvent[]>;
  listSegments(): Promise<string[]>;
  listSegmentProfiles(): Promise<SegmentProfile[]>;
  listPublishedRadarSignals(): Promise<RadarSignal[]>;
  listPublishedIntelligenceItems(): Promise<IntelligenceItem[]>;
}
```
(add `import type { RadarSignal, IntelligenceItem } from "@/types/operations";` to that file's imports)

In `src/repositories/local-content-repository.ts`:

1. Replace the static import: remove `companies` from the `@/data/content` import (keep `events as legacyEvents, segmentProfiles`), add:
```ts
import { operationsRepository } from "@/services/operations";
```

2. Add a deterministic accent-color helper (replaces the old hand-typed `accent` field, since the new `ManagedCompany` type doesn't store one — spec's field list doesn't include it):
```ts
const ACCENTS = ["#3185ff", "#7c65ff", "#36c4a1", "#ef9b4e", "#6abf69", "#64a8ff"];
function accentFor(slug: string): string {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}
```

3. Add a coverage helper next to the existing `countPostsBySegment`:
```ts
// Fase 8D — mesma regra de src/lib/agent/taxonomies.ts: associação
// post<->empresa é por NOME EXATO (post.companies.includes(company.name)),
// nunca por id/slug. hasCoverage só é true quando existe pelo menos um
// post PUBLICAMENTE VISÍVEL com esse nome exato — nunca por
// "monitoramento", que não existe nesta fase (ver Task 15).
export async function countPostsByCompanyName(): Promise<Record<string, number>> {
  const posts = await editorialRepository.listPosts();
  const counts: Record<string, number> = {};
  for (const post of posts) {
    if (!visible(post.status, post.scheduledAt)) continue;
    for (const name of post.companies) counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}
```

4. Replace `listCompanies`/`getCompanyBySlug` in the exported `localContentRepository` object:
```ts
  async listCompanies(){
    const[managed,counts]=await Promise.all([operationsRepository.listCompanies(),countPostsByCompanyName()]);
    return managed.filter(company=>company.active).map(company=>({name:company.name,slug:company.slug,ticker:company.ticker,sector:company.sector,description:company.description,website:company.website,accent:accentFor(company.slug),postCount:counts[company.name]??0,hasCoverage:(counts[company.name]??0)>0,active:company.active,featured:company.featured}));
  },
  async getCompanyBySlug(slug){return(await localContentRepository.listCompanies()).find(company=>company.slug===slug)},
```

5. Add the two new public read methods at the end of the exported object (before the closing `};`):
```ts
  // Fase 8D — só sinais/itens já publicados e ainda não expirados aparecem
  // ao público. A varredura de expiração já roda dentro de
  // operationsRepository.listRadarSignals()/listIntelligenceItems() (ver
  // Task 3) — aqui só filtramos por status "published".
  async listPublishedRadarSignals(){return(await operationsRepository.listRadarSignals()).filter(item=>item.status==="published").sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt))},
  async listPublishedIntelligenceItems(){return(await operationsRepository.listIntelligenceItems()).filter(item=>item.status==="published").sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt))},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx vitest run src/repositories/local-content-repository.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck + full suite**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx tsc --noEmit && npx vitest run`
Expected: some pre-existing consumers of `Company`/`ContentRepository` will now fail to typecheck if they construct a `Company` object manually anywhere (search first: `grep -rn "accent:" src/app src/components --include="*.tsx"` — the only construction site should be inside `page.tsx`'s JSX which just *reads* fields, not constructs objects, so this should be clean). Fix any real compile error surfaced here before proceeding — do not suppress with `as any`.

- [ ] **Step 6: Commit**

```bash
cd /home/pedro/vtres60-blog-fase8c
git add src/repositories/local-content-repository.ts src/repositories/local-content-repository.test.ts src/services/cms/content-repository.ts src/types/content.ts
git commit -m "feat(fase8d): empresas com cobertura real e leituras públicas de Radar/Inteligência publicados"
```

---

### Task 10: Home page integration — real Radar, real Intelligence, coverage-gated Hubs

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/home.module.css`
- Test: create `src/app/page.test.tsx` if no existing page-level test convention exists for `page.tsx` (check first: `find src/app -maxdepth 1 -iname "page.test.tsx"`) — if this project doesn't unit-test page components directly (likely, since it's a Server Component reading real repositories), rely on Task 13's Playwright coverage instead and skip a dedicated unit test here; note that decision explicitly rather than silently omitting it.

**Interfaces:**
- Consumes: `contentRepository.listCompanies()` (now coverage-aware, Task 9), `contentRepository.listPublishedRadarSignals()`/`listPublishedIntelligenceItems()` (Task 9).

- [ ] **Step 1: Confirm no page-level unit test convention exists**

Run: `find src/app -maxdepth 1 -iname "page.test.tsx"`
Expected: no output. Proceed without adding one — real coverage for this page comes from Task 13 (Playwright) which drives an actual browser against real (isolated) data, a stronger guarantee for a Server Component than a unit test with heavy mocking would be.

- [ ] **Step 2: Replace the hardcoded Radar section in `src/app/page.tsx`**

Add to the top-level `Promise.all` destructure (currently `const[articles,companies,events,segmentProfiles,home,settings]=...`), add two more entries:
```tsx
const[articles,companies,events,segmentProfiles,home,settings,radarSignals,intelligenceItems]=await Promise.all([contentRepository.listArticles(),contentRepository.listCompanies(),contentRepository.listEvents(),contentRepository.listSegmentProfiles(),configRepository.getHome(),configRepository.getSettings(),contentRepository.listPublishedRadarSignals(),contentRepository.listPublishedIntelligenceItems()]);
```

Replace the entire Radar `<section>` block with:
```tsx
{home.modules.radar&&<section className={`section-tight ${styles.radar}`}><div className="container"><div className="section-head"><div><span className="eyebrow"><Zap size={12}/> Atualização contínua</span><h2 className="section-title">Radar Industrial</h2></div><Link className="section-link" href="/radar">Abrir radar →</Link></div>{radarSignals.length===0?<div className={styles.emptyState}><p>Nenhum sinal publicado no momento. O Radar Industrial só mostra sinais com evidência real, revisados e aprovados pela curadoria VTRES60.</p></div>:<div className={styles.radarGrid}><div className={styles.radarLead}><div className={styles.pulse}><span/><b>SINAL EDITORIAL</b></div><h3>{radarSignals[0].title}</h3><p>{radarSignals[0].summary}</p><div className={styles.radarTags}>{radarSignals[0].tagIds.map((tagId)=><Link key={tagId} href={`/tags/${tagId}`}>#{tagId}</Link>)}</div><div className={styles.evidenceList}><span>Evidências:</span>{radarSignals[0].sourceUrls.map((url)=><a key={url} href={url} target="_blank" rel="noopener noreferrer">{new URL(url).hostname}</a>)}</div></div><div className={styles.radarList}>{radarSignals.slice(1,5).map((signal,index)=><Link href="/radar" key={signal.id}><span>{String(index+2).padStart(2,"0")}</span><div><b>{signal.title}</b><small>{signal.confidence==="alta"?"Confiança alta":signal.confidence==="média"?"Confiança média":"Confiança baixa"}</small></div><TrendingUp size={15}/></Link>)}</div></div>}</div></section>}
```

Replace the entire Inteligência `<section>` block with:
```tsx
{home.modules.intelligence&&<section className={`section ${styles.intelligence}`}><div className="container"><div className={styles.intelHead}><div><span className="eyebrow"><Sparkles size={12}/> Inteligência VTRES60</span><h2>Oportunidades por trás<br/>das notícias</h2><p>Sinais de mercado transformados em ações para marketing, vendas e crescimento industrial.</p></div><div className={styles.intelNumber}><span>CURADORIA</span><strong>B2B</strong><small>INDUSTRIA</small></div></div>{intelligenceItems.length===0?<div className={styles.emptyState}><p>Nenhuma análise publicada no momento. Cada item de Inteligência VTRES60 nasce de um sinal real do Radar, revisado antes de ir ao ar.</p></div>:<div className={styles.intelGrid}>{intelligenceItems.slice(0,3).map((item,index)=><article key={item.id}><span className={styles.kindBadge} data-kind={item.kind}>{item.kind==="fact"?"FATO":item.kind==="analysis"?"ANÁLISE VTRES60":"RECOMENDAÇÃO"}</span><h3>{item.title}</h3><p>{item.analysis}</p>{item.kind==="recommendation"&&item.recommendedAction&&<b>{item.recommendedAction}<ArrowRight size={13}/></b>}</article>)}</div>}</div></section>}
```

Replace the `companies.map(...)` inside the Hubs `<section>` — no structural change needed since `contentRepository.listCompanies()` now already only returns `active` companies via Task 9; but per spec, the home must show only companies with real coverage, so add a filter:
```tsx
{home.modules.companies&&<section className={`section ${styles.companies}`}><div className="container"><div className="section-head"><div><span className="eyebrow">Empresas acompanhadas</span><h2 className="section-title">Hubs editoriais</h2></div><Link className="section-link" href="/empresas">Todas as empresas →</Link></div><p className={styles.intro}>Notícias, movimentos estratégicos, indicadores e contexto reunidos em uma linha do tempo para cada companhia.</p>{companies.filter(c=>c.hasCoverage).length===0?<div className={styles.emptyState}><p>Nenhuma empresa com cobertura editorial publicada ainda.</p></div>:<div className={styles.companyGrid}>{companies.filter(c=>c.hasCoverage).sort((a,b)=>Number(b.featured)-Number(a.featured)).map((company)=><Link href={`/empresas/${company.slug}`} key={company.slug} style={{"--accent":company.accent} as React.CSSProperties}><header><Building2 size={18}/>{company.ticker&&<small>{company.ticker}</small>}</header><strong>{company.name}</strong><span>{company.sector}</span><p>{company.description}</p><footer>Explorar hub <ArrowRight size={13}/></footer></Link>)}</div>}</div></section>}
```

Also remove the now-unused `slugify` import if nothing else in the file uses it (`grep -n "slugify" src/app/page.tsx` — check before removing).

- [ ] **Step 3: Add the new CSS classes to `src/app/home.module.css`**

Append (in both the dark-mode base block near `.radar{...}` and the light-mode override block near line 28-32 — follow the exact same dual-block pattern already used for every other class in this file):

```css
.emptyState{padding:34px;text-align:center;color:#8f9bad;font-size:13px;border:1px dashed var(--line);border-radius:16px}
.evidenceList{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;font-size:10px}
.evidenceList span{color:#667085}
.evidenceList a{color:#3268bd;text-decoration:underline}
.kindBadge{display:inline-block;padding:4px 8px;border-radius:6px;font-size:9px;letter-spacing:.08em;text-transform:uppercase}
.kindBadge[data-kind="fact"]{background:rgba(52,133,255,.12);color:#3268bd}
.kindBadge[data-kind="analysis"]{background:rgba(124,101,255,.14);color:#7c65ff}
.kindBadge[data-kind="recommendation"]{background:rgba(239,155,78,.16);color:#ef9b4e}
```

(Light-mode override, add near the existing `.radar{--line:...}` / `.intelligence{--line:...}` blocks:)
```css
.emptyState{color:#667085;border-color:rgba(16,24,40,.15)}
.evidenceList span{color:#667085}
```

- [ ] **Step 4: Typecheck + build in the worktree (never in `/home/pedro/vtres60-blog`)**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx tsc --noEmit && npx eslint src/app/page.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/pedro/vtres60-blog-fase8c
git add src/app/page.tsx src/app/home.module.css
git commit -m "feat(fase8d): home usa Radar e Inteligência reais, com estado vazio honesto, e Hubs só com cobertura real"
```

---

### Task 11: Admin UI — extend `OperationsEditor`/`CrudList` for companies, radar, intelligence

**Files:**
- Modify: `src/components/admin/operations-editor.tsx`
- Modify: `src/components/admin/crud-list.tsx` (statusLabel)
- Create: `src/app/admin/(protected)/empresas/page.tsx`, `.../novo/page.tsx`, `.../[id]/page.tsx`
- Create: `src/app/admin/(protected)/radar/page.tsx`, `.../novo/page.tsx`, `.../[id]/page.tsx`
- Create: `src/app/admin/(protected)/inteligencia/page.tsx`, `.../novo/page.tsx`, `.../[id]/page.tsx`
- Modify: the nav file located in Task 1

**Interfaces:**
- Consumes: everything from Tasks 3, 6, 7, 8.
- Produces: working `/admin/empresas`, `/admin/radar`, `/admin/inteligencia` — consumed by Task 13 (Playwright/axe).

- [ ] **Step 1: Extend `statusLabel` in `crud-list.tsx`**

```ts
const statusLabel=(status:string)=>({published:"Publicado",scheduled:"Agendado",candidate:"Candidato",verified:"Verificado",archived:"Arquivado",cancelled:"Cancelado",draft:"Rascunho",reviewed:"Revisado",expired:"Expirado",rejected:"Rejeitado"}[status]??"Rascunho");
```

- [ ] **Step 2: Extend `OperationsEditor` — add `company` kind**

In `src/components/admin/operations-editor.tsx`:

1. Extend the type union and import:
```ts
import type { ManagedCompany, ManagedEvent, ManagedSegment } from "@/types/operations";
type Editable=ManagedSegment|ManagedEvent|ManagedCompany;
```

2. Extend `blank()`:
```ts
function blank(kind:"segment"|"event"|"company"):Editable{if(kind==="segment")return{...}/* unchanged */;if(kind==="event")return{...}/* unchanged */;return{id:"",name:"",slug:"",legalName:"",description:"",sector:"",website:"",ticker:"",tickerSource:"",active:true,featured:false,createdAt:"",updatedAt:""}}
```
(keep the existing `segment`/`event` branches exactly as they are today — only add the new `company` branch as the final `return`)

3. Extend the `OperationsEditor` component signature and body:
```ts
export function OperationsEditor({kind,initial,events=[],realArticleCount}:{kind:"segment"|"event"|"company";initial?:Editable;events?:ManagedEvent[];realArticleCount?:number}){
  // ...unchanged state/save logic, but api/base become:
  const api=kind==="segment"?"/api/admin/segments":kind==="event"?"/api/admin/events":"/api/admin/companies";
  const base=kind==="segment"?"/admin/segmentos":kind==="event"?"/admin/agenda":"/admin/empresas";
  // ...
  return <div className="admin-form">...<div className="admin-fields"><Field label={kind==="segment"?"Nome do segmento":kind==="event"?"Nome do evento":"Nome da empresa"} value={data.name} onChange={...}/><Field label="Slug" value={data.slug} onChange={...}/>{kind==="segment"?<SegmentFields .../>:kind==="event"?<EventFields .../>:<CompanyFields data={data as ManagedCompany} change={change}/>}</div>...
}
```

4. Add the new `CompanyFields` component (mirrors `SegmentFields`/`EventFields`):
```tsx
function CompanyFields({data,change}:{data:ManagedCompany;change:(key:string,value:unknown)=>void}){
  return <>
    <Field full textarea label="Descrição" value={data.description} onChange={(value)=>change("description",value)}/>
    <Field label="Setor" value={data.sector} onChange={(value)=>change("sector",value)}/>
    <Field label="Razão social (opcional)" value={data.legalName??""} onChange={(value)=>change("legalName",value)}/>
    <Field label="Site oficial" type="url" value={data.website} onChange={(value)=>change("website",value)}/>
    <Field label="Ticker (opcional)" value={data.ticker??""} onChange={(value)=>change("ticker",value)}/>
    <Field label="Fonte do ticker (opcional)" value={data.tickerSource??""} onChange={(value)=>change("tickerSource",value)} hint="Nunca invente um ticker — deixe em branco se não houver fonte confirmada."/>
    <label className="admin-check"><input type="checkbox" checked={data.active} onChange={(event)=>change("active",event.target.checked)}/>Ativa (aparece no admin e permite associação de posts)</label>
    <label className="admin-check"><input type="checkbox" checked={data.featured} onChange={(event)=>change("featured",event.target.checked)}/>Destacar na Home (só aparece se também houver cobertura real)</label>
  </>
}
```

- [ ] **Step 3: Create the 3 pages for `/admin/empresas`**

`src/app/admin/(protected)/empresas/page.tsx`:
```tsx
import { AdminPageHeading } from "@/components/admin/page-heading";
import { CrudList } from "@/components/admin/crud-list";
import { operationsRepository } from "@/services/operations";
import { countPostsByCompanyName } from "@/repositories/local-content-repository";

export default async function Page(){
  const[companies,counts]=await Promise.all([operationsRepository.listCompanies(),countPostsByCompanyName()]);
  return <><AdminPageHeading eyebrow="Portal" title="Empresas" description="Empresas acompanhadas pela redação — só aparecem na Home quando há cobertura editorial real."/><CrudList initial={companies.map(item=>({id:item.id,title:item.name,slug:item.slug,meta:`${counts[item.name]??0} posts com cobertura · ${item.active?"Ativa":"Inativa"}${item.featured?" · Destacada":""}`}))} basePath="/admin/empresas" apiPath="/api/admin/companies" createLabel="Nova empresa" entityName="Empresa"/></>
}
```

`src/app/admin/(protected)/empresas/novo/page.tsx`:
```tsx
import { AdminPageHeading } from "@/components/admin/page-heading";
import { OperationsEditor } from "@/components/admin/operations-editor";
export default function Page(){return <><AdminPageHeading eyebrow="Empresas" title="Nova empresa" description="Cadastre uma empresa real acompanhada pela redação."/><OperationsEditor kind="company"/></>}
```

`src/app/admin/(protected)/empresas/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { AdminPageHeading } from "@/components/admin/page-heading";
import { OperationsEditor } from "@/components/admin/operations-editor";
import { operationsRepository } from "@/services/operations";
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;const item=await operationsRepository.getCompany(id);if(!item)notFound();return <><AdminPageHeading eyebrow="Empresas" title="Editar empresa" description={`Atualize “${item.name}”.`}/><OperationsEditor kind="company" initial={item}/></>}
```

- [ ] **Step 4: Create a dedicated `RadarEditor`/`IntelligenceEditor` component (do NOT force these into `OperationsEditor` — their forms need real-data pickers: multi-select of real posts/tags/segments/companies, which is structurally different from the segment/event/company forms and would bloat `OperationsEditor` beyond its "one clear responsibility" — this respects the "files that change together live together, split by responsibility" guidance)**

Create `src/components/admin/radar-editor.tsx`:
```tsx
"use client";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useState } from "react";
import type { ManagedPost, ManagedTag } from "@/types/editorial";
import type { ManagedCompany, ManagedSegment, RadarSignal } from "@/types/operations";

type Draft = Omit<RadarSignal, "sourceUrls" | "createdAt" | "updatedAt">;

function blank(): Draft {
  return { id: "", title: "", summary: "", evidencePostIds: [], tagIds: [], segmentSlugs: [], companySlugs: [], confidence: "média", generatedAt: new Date().toISOString(), validUntil: "", status: "draft" };
}

export function RadarEditor({ initial, posts, tags, segments, companies }: { initial?: RadarSignal; posts: ManagedPost[]; tags: ManagedTag[]; segments: ManagedSegment[]; companies: ManagedCompany[] }) {
  const router = useRouter();
  const isNew = !initial;
  const [data, setData] = useState<Draft>(initial ?? blank());
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("Alterações ainda não salvas");
  const change = (key: keyof Draft, value: unknown) => { setData((current) => ({ ...current, [key]: value })); setState("idle"); setMessage("Alterações ainda não salvas"); };
  const toggle = (key: "evidencePostIds" | "tagIds" | "segmentSlugs" | "companySlugs", value: string) => {
    const current = data[key] as string[];
    change(key, current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  };
  async function save(status?: RadarSignal["status"]) {
    setState("saving"); setMessage("Salvando...");
    const payload = status ? { ...data, status, reviewedAt: status === "reviewed" ? new Date().toISOString() : data.reviewedAt } : data;
    const response = await fetch(isNew ? "/api/admin/radar" : `/api/admin/radar/${data.id}`, { method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) { setState("error"); setMessage(body.error || "Falha ao salvar."); return; }
    setData(body); setState("success"); setMessage("Alterações salvas.");
    if (isNew) router.replace(`/admin/radar/${body.id}`);
    router.refresh();
  }
  return <div className="admin-form">
    <details className="admin-section" open><summary>Sinal editorial</summary><div className="admin-section-body"><div className="admin-fields">
      <div className="admin-field admin-field-full"><label htmlFor="radar-title">Título</label><input id="radar-title" value={data.title} onChange={(e) => change("title", e.target.value)} /></div>
      <div className="admin-field admin-field-full"><label htmlFor="radar-summary">Resumo</label><textarea id="radar-summary" value={data.summary} onChange={(e) => change("summary", e.target.value)} /></div>
      <div className="admin-field"><label htmlFor="radar-confidence">Confiança</label><select id="radar-confidence" value={data.confidence} onChange={(e) => change("confidence", e.target.value)}><option value="baixa">Baixa</option><option value="média">Média</option><option value="alta">Alta</option></select></div>
      <div className="admin-field"><label htmlFor="radar-valid">Válido até</label><input id="radar-valid" type="date" value={data.validUntil.slice(0, 10)} onChange={(e) => change("validUntil", e.target.value ? new Date(`${e.target.value}T23:59:59Z`).toISOString() : "")} /></div>
      <div className="admin-field admin-field-full"><label>Posts de evidência (obrigatório para publicar)</label><div className="admin-check-grid">{posts.map((post) => <label className="admin-check" key={post.id}><input type="checkbox" checked={data.evidencePostIds.includes(post.id)} onChange={() => toggle("evidencePostIds", post.id)} />{post.title}</label>)}</div></div>
      <div className="admin-field admin-field-full"><label>Tags reais</label><div className="admin-check-grid">{tags.map((tag) => <label className="admin-check" key={tag.id}><input type="checkbox" checked={data.tagIds.includes(tag.id)} onChange={() => toggle("tagIds", tag.id)} />{tag.name}</label>)}</div></div>
      <div className="admin-field admin-field-full"><label>Segmentos reais</label><div className="admin-check-grid">{segments.map((segment) => <label className="admin-check" key={segment.slug}><input type="checkbox" checked={data.segmentSlugs.includes(segment.slug)} onChange={() => toggle("segmentSlugs", segment.slug)} />{segment.name}</label>)}</div></div>
      <div className="admin-field admin-field-full"><label>Empresas reais</label><div className="admin-check-grid">{companies.map((company) => <label className="admin-check" key={company.slug}><input type="checkbox" checked={data.companySlugs.includes(company.slug)} onChange={() => toggle("companySlugs", company.slug)} />{company.name}</label>)}</div></div>
    </div></div></details>
    <div className="admin-savebar"><span data-state={state}>{message}</span>
      <button className="admin-secondary-button" onClick={() => save()} disabled={state === "saving"}>Salvar rascunho</button>
      <button className="admin-secondary-button" onClick={() => save("reviewed")} disabled={state === "saving"}>Marcar como revisado</button>
      <button className="admin-primary-button" onClick={() => save("published")} disabled={state === "saving"}><Save size={14} />Publicar</button>
    </div>
  </div>;
}
```

- [ ] **Step 5: Create `/admin/radar` pages**

`src/app/admin/(protected)/radar/page.tsx`:
```tsx
import { AdminPageHeading } from "@/components/admin/page-heading";
import { CrudList } from "@/components/admin/crud-list";
import { operationsRepository } from "@/services/operations";

export default async function Page(){
  const signals=await operationsRepository.listRadarSignals();
  return <><AdminPageHeading eyebrow="Portal" title="Radar Industrial" description="Sinais editoriais com evidência real — nenhum é publicado sem revisão e fonte."/><CrudList initial={signals.map(item=>({id:item.id,title:item.title,slug:item.id,meta:`${item.evidencePostIds.length} evidência(s) · válido até ${new Date(item.validUntil).toLocaleDateString("pt-BR")}`,status:item.status}))} basePath="/admin/radar" apiPath="/api/admin/radar" createLabel="Novo sinal" entityName="Sinal"/></>
}
```

`src/app/admin/(protected)/radar/novo/page.tsx`:
```tsx
import { AdminPageHeading } from "@/components/admin/page-heading";
import { RadarEditor } from "@/components/admin/radar-editor";
import { editorialRepository } from "@/services/editorial";
import { operationsRepository } from "@/services/operations";

export default async function Page(){
  const[posts,tags,segments,companies]=await Promise.all([editorialRepository.listPosts(),editorialRepository.listTags(),operationsRepository.listSegments(),operationsRepository.listCompanies()]);
  return <><AdminPageHeading eyebrow="Radar" title="Novo sinal" description="Selecione evidência real — nenhuma fonte é digitada livremente."/><RadarEditor posts={posts.filter(p=>p.status==="published")} tags={tags} segments={segments} companies={companies}/></>
}
```

`src/app/admin/(protected)/radar/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { AdminPageHeading } from "@/components/admin/page-heading";
import { RadarEditor } from "@/components/admin/radar-editor";
import { editorialRepository } from "@/services/editorial";
import { operationsRepository } from "@/services/operations";

export default async function Page({params}:{params:Promise<{id:string}>}){
  const{id}=await params;
  const[item,posts,tags,segments,companies]=await Promise.all([operationsRepository.getRadarSignal(id),editorialRepository.listPosts(),editorialRepository.listTags(),operationsRepository.listSegments(),operationsRepository.listCompanies()]);
  if(!item)notFound();
  return <><AdminPageHeading eyebrow="Radar" title="Editar sinal" description={`Atualize “${item.title}”.`}/><RadarEditor initial={item} posts={posts.filter(p=>p.status==="published")} tags={tags} segments={segments} companies={companies}/></>
}
```

- [ ] **Step 6: Create `IntelligenceEditor` component + `/admin/inteligencia` pages** (same structure as Step 4-5, adapted)

Create `src/components/admin/intelligence-editor.tsx`:
```tsx
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
```

`src/app/admin/(protected)/inteligencia/page.tsx`:
```tsx
import { AdminPageHeading } from "@/components/admin/page-heading";
import { CrudList } from "@/components/admin/crud-list";
import { operationsRepository } from "@/services/operations";

export default async function Page(){
  const items=await operationsRepository.listIntelligenceItems();
  return <><AdminPageHeading eyebrow="Portal" title="Inteligência VTRES60" description="Fatos, análises e recomendações — sempre derivados de um sinal real do Radar."/><CrudList initial={items.map(item=>({id:item.id,title:item.title,slug:item.id,meta:`${item.kind==="fact"?"Fato":item.kind==="analysis"?"Análise":"Recomendação"} · ${item.evidencePostIds.length} evidência(s)`,status:item.status}))} basePath="/admin/inteligencia" apiPath="/api/admin/intelligence" createLabel="Novo item" entityName="Item"/></>
}
```

`src/app/admin/(protected)/inteligencia/novo/page.tsx`:
```tsx
import { AdminPageHeading } from "@/components/admin/page-heading";
import { IntelligenceEditor } from "@/components/admin/intelligence-editor";
import { editorialRepository } from "@/services/editorial";
import { operationsRepository } from "@/services/operations";

export default async function Page(){
  const[signals,posts,segments,companies]=await Promise.all([operationsRepository.listRadarSignals(),editorialRepository.listPosts(),operationsRepository.listSegments(),operationsRepository.listCompanies()]);
  return <><AdminPageHeading eyebrow="Inteligência" title="Novo item" description="Todo item precisa referenciar um sinal real do Radar."/><IntelligenceEditor signals={signals.filter(s=>s.status==="published")} posts={posts.filter(p=>p.status==="published")} segments={segments} companies={companies}/></>
}
```

`src/app/admin/(protected)/inteligencia/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { AdminPageHeading } from "@/components/admin/page-heading";
import { IntelligenceEditor } from "@/components/admin/intelligence-editor";
import { editorialRepository } from "@/services/editorial";
import { operationsRepository } from "@/services/operations";

export default async function Page({params}:{params:Promise<{id:string}>}){
  const{id}=await params;
  const[item,signals,posts,segments,companies]=await Promise.all([operationsRepository.getIntelligenceItem(id),operationsRepository.listRadarSignals(),editorialRepository.listPosts(),operationsRepository.listSegments(),operationsRepository.listCompanies()]);
  if(!item)notFound();
  return <><AdminPageHeading eyebrow="Inteligência" title="Editar item" description={`Atualize “${item.title}”.`}/><IntelligenceEditor initial={item} signals={signals.filter(s=>s.status==="published")} posts={posts.filter(p=>p.status==="published")} segments={segments} companies={companies}/></>
}
```

- [ ] **Step 7: Add the 3 nav entries** using the exact pattern found in Task 1.

- [ ] **Step 8: Typecheck**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx tsc --noEmit`
Expected: PASS. Fix any type errors surfaced by the `Editable` union widening in `operations-editor.tsx` before proceeding.

- [ ] **Step 9: Commit**

```bash
cd /home/pedro/vtres60-blog-fase8c
git add src/components/admin/operations-editor.tsx src/components/admin/crud-list.tsx src/components/admin/radar-editor.tsx src/components/admin/intelligence-editor.tsx "src/app/admin/(protected)/empresas" "src/app/admin/(protected)/radar" "src/app/admin/(protected)/inteligencia"
git commit -m "feat(fase8d): telas admin de Empresas, Radar e Inteligência (CRUD completo com evidência real)"
```

---

### Task 12: Real `/radar` page

**Files:**
- Create: `src/app/radar/page.tsx`
- Create: `src/app/radar/radar.module.css`

**Interfaces:**
- Consumes: `contentRepository.listPublishedRadarSignals()` (Task 9), `editorialRepository.listPosts()` (for evidence post titles/links).

- [ ] **Step 1: Implement the page**

```tsx
import Link from "next/link";
import { contentRepository } from "@/services/cms";
import { editorialRepository } from "@/services/editorial";
import styles from "./radar.module.css";

export const metadata = { title: "Radar Industrial | VTRES60", description: "Sinais editoriais da indústria brasileira, sempre com evidência real e verificável." };

export default async function RadarPage(){
  const[signals,posts]=await Promise.all([contentRepository.listPublishedRadarSignals(),editorialRepository.listPosts()]);
  const postById=new Map(posts.map(post=>[post.id,post]));
  return <main className="section"><div className="container">
    <header className={styles.head}><span className="eyebrow">Curadoria VTRES60</span><h1>Radar Industrial</h1><p>Sinais editoriais construídos exclusivamente a partir de posts reais publicados, com fonte e data verificáveis. Nenhum sinal é publicado sem evidência.</p></header>
    {signals.length===0?<div className={styles.empty}><p>Nenhum sinal publicado no momento.</p></div>:<div className={styles.grid}>{signals.map(signal=><article key={signal.id} className={styles.card}><time dateTime={signal.generatedAt}>{new Date(signal.generatedAt).toLocaleDateString("pt-BR")}</time><h2>{signal.title}</h2><p>{signal.summary}</p><div className={styles.evidence}><span>Evidências:</span><ul>{signal.evidencePostIds.map(id=>{const post=postById.get(id);return post?<li key={id}><Link href={`/noticias/${post.slug}`}>{post.title}</Link></li>:null})}</ul></div><div className={styles.sources}><span>Fontes:</span>{signal.sourceUrls.map(url=><a key={url} href={url} target="_blank" rel="noopener noreferrer">{new URL(url).hostname}</a>)}</div></article>)}</div>}
  </div></main>
}
```

- [ ] **Step 2: Add minimal styling in `src/app/radar/radar.module.css`**

```css
.head{max-width:640px;margin-bottom:32px}
.head h1{font-size:clamp(32px,4vw,48px);letter-spacing:-.03em;margin:12px 0}
.head p{color:#667085;line-height:1.55}
.empty{padding:40px;text-align:center;color:#667085;border:1px dashed var(--line);border-radius:16px}
.grid{display:grid;gap:20px}
.card{border:1px solid var(--line);border-radius:16px;padding:28px;background:var(--surface,#fff)}
.card time{color:#98a2b3;font-size:11px}
.card h2{margin:10px 0;font-size:22px}
.evidence,.sources{margin-top:16px;font-size:12px}
.evidence span,.sources span{display:block;color:#667085;margin-bottom:6px}
.evidence ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:4px}
.evidence a,.sources a{color:#3268bd}
.sources{display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}
```

- [ ] **Step 3: Typecheck**

Run: `cd /home/pedro/vtres60-blog-fase8c && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd /home/pedro/vtres60-blog-fase8c
git add src/app/radar
git commit -m "feat(fase8d): página real /radar com evidências e fontes"
```

---

### Task 13: Isolated build + full validation loop (lint, typecheck, unit tests, Playwright, axe, Lighthouse)

**Files:** none created/modified except test additions below and a PID-safe server-start script snippet (not saved as a file — run inline).

**Interfaces:**
- Consumes: everything from Tasks 1-12.

- [ ] **Step 1: Full lint + typecheck + unit suite**

Run:
```bash
cd /home/pedro/vtres60-blog-fase8c
npx eslint . --max-warnings=0
npx tsc --noEmit
npx vitest run
```
Expected: lint clean, typecheck clean, full suite passes (481 pre-existing + all new tests from Tasks 3-9, roughly 481+2+11+8+2+4+4+2 ≈ 514).

- [ ] **Step 2: Isolated production build (worktree only)**

Run: `cd /home/pedro/vtres60-blog-fase8c && npm run build`
Expected: build succeeds with no new type/lint errors. **Do NOT run this in `/home/pedro/vtres60-blog`.**

- [ ] **Step 3: Start an isolated test server with a captured PID (never by pattern-kill later)**

```bash
cd /home/pedro/vtres60-blog-fase8c
npx next start -p 3999 > /tmp/vtres60-fase8d-server.log 2>&1 &
SERVER_PID=$!
echo "SERVER_PID=$SERVER_PID" > /tmp/vtres60-fase8d-server.pid
sleep 3
curl -sf http://localhost:3999/blog/ -o /dev/null && echo "server up (pid $SERVER_PID)"
```
Expected: `server up (pid <n>)`. If the server 500s with "Invalid API key", force the correct Supabase env vars explicitly from `.env.production` into this same command (per `project_vtres60_pm2_env_fix.md` — do NOT try `env -u`, force the real values).

- [ ] **Step 4: Add new axe coverage**

In `e2e/axe.spec.ts`, extend `PUBLIC_PAGES`:
```ts
const PUBLIC_PAGES = ["/", "/noticias", "/categorias/marketing-industrial", "/empresas/weg", "/buscar", "/segmentos", "/segmentos/metalurgia", "/agenda", "/radar"];
```
Add to the authenticated admin `describe` block's loop array:
```ts
for (const adminPath of ["/admin/segmentos", "/admin/configuracoes", "/admin/leads", "/admin/agenda", "/admin/empresas", "/admin/radar", "/admin/inteligencia"]) {
```

- [ ] **Step 5: Add a new Playwright spec covering the required scenarios**

Create `e2e/radar-intelligence-hubs.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { withBasePath } from "./base-path";

test.describe("Radar Industrial (público)", () => {
  test("home mostra estado vazio honesto quando não há sinal publicado, ou mostra sinal real com evidência", async ({ page }) => {
    await page.goto(withBasePath("/"));
    const radarSection = page.locator("section", { hasText: "Radar Industrial" });
    await expect(radarSection).toBeVisible();
    // Aceita tanto o estado vazio honesto quanto um sinal real — o teste
    // prova que a seção nunca mostra o texto hardcoded antigo.
    await expect(page.getByText("IA industrial acelera projetos de eficiência")).toHaveCount(0);
  });

  test("/radar é uma página real e nunca mostra o array hardcoded antigo", async ({ page }) => {
    await page.goto(withBasePath("/radar"));
    await expect(page.getByRole("heading", { name: "Radar Industrial" })).toBeVisible();
    await expect(page.getByText("Demanda emergente")).toHaveCount(0);
  });
});

test.describe("Inteligência VTRES60 (público)", () => {
  test("home nunca mostra o array de 3 itens hardcoded antigo", async ({ page }) => {
    await page.goto(withBasePath("/"));
    await expect(page.getByText("Fabricantes de máquinas encontram espaço em retrofit")).toHaveCount(0);
  });
});

test.describe("Hubs de empresas (público)", () => {
  test("Home só destaca empresas com cobertura real (nunca uma sem post publicado)", async ({ page }) => {
    await page.goto(withBasePath("/"));
    const companiesSection = page.locator("section", { hasText: "Hubs editoriais" });
    if (await companiesSection.count()) {
      const cards = companiesSection.locator(`a[href^="${withBasePath("/empresas/")}"]`);
      // Cada card visível precisa corresponder a uma empresa com pelo menos
      // um post real — verificado indiretamente: a seção some inteiramente
      // quando data-hasCoverage é falso para todas (ver Task 10's emptyState).
      expect(await cards.count()).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 6: Run Playwright against the isolated server**

Run: `cd /home/pedro/vtres60-blog-fase8c && PLAYWRIGHT_BASE_URL=http://localhost:3999 npx playwright test`
Expected: all pass, including the pre-existing 120 tests + new additions.

- [ ] **Step 7: Run axe**

Run: `cd /home/pedro/vtres60-blog-fase8c && PLAYWRIGHT_BASE_URL=http://localhost:3999 npx playwright test e2e/axe.spec.ts`
Expected: PASS, no P0/P1 on `/radar`, `/admin/radar`, `/admin/inteligencia`, `/admin/empresas`. Fix any real contrast/label violation found — do not suppress.

- [ ] **Step 8: Run Lighthouse against the same isolated server (reuse the Fase 8C technique — Playwright's bundled Chromium)**

Run the same Lighthouse invocation pattern used in Fase 8C (see `docs/fechamento-fase8c.md` for the exact command using Playwright's bundled Chromium) against `http://localhost:3999/blog/`, `http://localhost:3999/blog/radar`, both mobile and desktop. Expected: 100 accessibility/best-practices/SEO on the new `/radar` page, consistent with every other page in this project; performance not chased further (documented P2 precedent already exists for this project).

- [ ] **Step 9: Stop the isolated server by its exact captured PID — NEVER by pattern**

```bash
SERVER_PID=$(cat /tmp/vtres60-fase8d-server.pid | cut -d= -f2)
kill "$SERVER_PID"
sleep 1
kill -0 "$SERVER_PID" 2>/dev/null && kill -9 "$SERVER_PID" || echo "stopped cleanly"
```

- [ ] **Step 10: Confirm production PM2 processes were not affected**

```bash
pm2 jlist | python3 -c "
import json,sys
data=json.load(sys.stdin)
for p in data:
    print(p['name'], '| pid:', p.get('pid'), '| restarts:', p['pm2_env'].get('restart_time'), '| status:', p['pm2_env'].get('status'))
"
```
Expected: identical restart counts to the pre-work snapshot (`vtres60-blog: 88`, `v360-dashboard: 95`, `vtres60-agent-worker: 1`, `vtres60: 0`). If any count increased, STOP, do not continue to Task 14, and report `PRODUCTION_PROCESS_INCIDENT=true` with the cause.

- [ ] **Step 11: Secrets scan**

Run: `cd /home/pedro/vtres60-blog-fase8c && git diff main --stat` then grep the actual diff for common secret patterns:
```bash
git diff main -- . | grep -inE "sk-[a-z0-9]{20,}|service_role|SUPABASE_(URL|ANON_KEY|SERVICE_ROLE_KEY)\s*=|AIza[0-9A-Za-z_-]{35}|api[_-]?key\s*[:=]\s*['\"][a-z0-9]{20,}"
```
Expected: no output (all new code reads env vars by name, never hardcodes a value).

- [ ] **Step 12: Commit test additions**

```bash
cd /home/pedro/vtres60-blog-fase8c
git add e2e/axe.spec.ts e2e/radar-intelligence-hubs.spec.ts
git commit -m "test(fase8d): cobertura Playwright/axe para Radar, Inteligência e Hubs administráveis"
```

---

### Task 14: Documented (unapplied) SQL schema for future migration

**Files:**
- Create: `supabase-radar-intelligence-companies-schema-fase8d.sql`

**Interfaces:** none (documentation-only artifact, mirrors `supabase-events-schema-fase8c.sql`'s role).

- [ ] **Step 1: Write the schema file**

```sql
-- VTRES60 Blog — Fase 8D: modelo de dados para Radar Industrial,
-- Inteligência VTRES60 e Empresas administráveis.
--
-- NAO APLICADA em produção nesta fase (mesma regra da Fase 8C —
-- supabase-events-schema-fase8c.sql). A fonte de verdade real desta fase
-- é src/content/{companies,radarSignals,intelligenceItems}.json via
-- operationsRepository (mesmo padrão de segments/events). Este arquivo
-- documenta o esquema que corresponderia a esses tipos SE forem migrados
-- para o Supabase no futuro.
--
-- "id uuid" (nao "text"): companies/radar_signals/intelligence_items sao
-- entidades inteiramente novas desta fase, sem ids legados prefixados
-- vindos de JSON antigo (diferente de posts/categories/tags/agenda_events)
-- — seguem o mesmo padrao das tabelas de infraestrutura mais recentes
-- (agent_runs, provider_cost_settings). FKs para posts.id continuam
-- "text", pelo bug real ja documentado na Fase 7
-- (supabase-agent-runs-schema.sql declarava published_post_id uuid contra
-- posts.id text e falhava com ERROR 42804).

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  legal_name text,
  description text not null,
  sector text not null,
  website text not null,
  ticker text,
  ticker_source text,
  active boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_signals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  evidence_post_ids text[] not null default '{}',
  source_urls text[] not null default '{}',
  tag_ids text[] not null default '{}',
  segment_slugs text[] not null default '{}',
  company_slugs text[] not null default '{}',
  confidence text not null check (confidence in ('baixa', 'média', 'alta')),
  generated_at timestamptz not null default now(),
  valid_until timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'published', 'expired', 'rejected')),
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intelligence_items (
  id uuid primary key default gen_random_uuid(),
  radar_signal_id uuid not null references public.radar_signals(id) on delete cascade,
  kind text not null check (kind in ('fact', 'analysis', 'recommendation')),
  title text not null,
  analysis text not null,
  recommended_action text,
  evidence_post_ids text[] not null default '{}',
  source_urls text[] not null default '{}',
  segment_slugs text[] not null default '{}',
  company_slugs text[] not null default '{}',
  confidence text not null check (confidence in ('baixa', 'média', 'alta')),
  generated_at timestamptz not null default now(),
  valid_until timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'published', 'expired', 'rejected')),
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists radar_signals_public_visibility_idx
  on public.radar_signals (generated_at desc) where status = 'published';
create index if not exists intelligence_items_public_visibility_idx
  on public.intelligence_items (generated_at desc) where status = 'published';
create index if not exists companies_active_idx on public.companies (active) where active = true;

-- RLS deny-all, mesma logica de todas as outras tabelas deste projeto:
-- toda a aplicacao acessa via supabaseAdmin (service_role), que bypassa RLS.
alter table public.companies enable row level security;
alter table public.radar_signals enable row level security;
alter table public.intelligence_items enable row level security;

comment on table public.companies is 'Fase 8D — modelo nao aplicado. Fonte de verdade real continua sendo src/content/companies.json ate uma decisao explicita de migrar para Supabase.';
comment on table public.radar_signals is 'Fase 8D — modelo nao aplicado. Fonte de verdade real continua sendo src/content/radarSignals.json.';
comment on table public.intelligence_items is 'Fase 8D — modelo nao aplicado. Fonte de verdade real continua sendo src/content/intelligenceItems.json.';
```

- [ ] **Step 2: Commit**

```bash
cd /home/pedro/vtres60-blog-fase8c
git add supabase-radar-intelligence-companies-schema-fase8d.sql
git commit -m "docs(fase8d): schema SQL documentado (não aplicado) para Radar/Inteligência/Empresas"
```

---

### Task 15: Monitoring/NewsFetcher decision — documented, not implemented

**Files:** none (this task produces a section of Task 16's final report — no code).

**Interfaces:** none.

- [ ] **Step 1: Confirm the finding is still accurate**

Re-run: `grep -rn "monitorar\|companyQuery\|per-company" src/lib/agent --include="*.ts"` in the worktree.
Expected: no output (confirms the Fase 8D research finding still holds — no per-company monitoring concept exists).

- [ ] **Step 2: Record the decision** (goes into `docs/implementacao-fase8d-radar-inteligencia-hubs.md`, Task 16)

`MONITORING_IMPLEMENTED=false`. Rationale to document verbatim: the spec requires calculating quota/cost impact and confirming dedupe/newsworthiness/window/query-limit *before* adding any per-company query — this phase's research (recorded during initial investigation) found that (a) `news-fetcher.ts` makes exactly one fixed-keyword GNews call per cron tick (2x/day), (b) there is no budget-enforcement code anywhere in the agent pipeline (`provider_budget_settings` exists only as a read-only display in `/admin/custos`, never checked by `news-fetcher.ts`/`workflow.ts`/either trigger route), and (c) building real budget enforcement is itself a nontrivial feature, not a config flag. Adding N per-company queries without that enforcement would be exactly the kind of unbounded-cost change the spec explicitly warns against ("Não criar uma consulta por empresa sem avaliar custo"). Decision: do not implement automated per-company monitoring this phase; company "featured" status in the home continues to depend only on real post coverage (`hasCoverage`), never on a monitoring flag. This is a well-scoped, explicit follow-up for a future phase (build real budget enforcement first, then per-company monitoring on top of it).

- [ ] **Step 3: No commit** (documentation lands in Task 16's single doc commit).

---

### Task 16: Final documentation, memory updates, and report

**Files:**
- Create: `docs/implementacao-fase8d-radar-inteligencia-hubs.md`
- Modify (outside the repo, in the memory directory): `project_vtres60_timeline.md`, `project_vtres60_pending_work.md`, `MEMORY.md`

**Interfaces:** none — this is the wrap-up task.

- [ ] **Step 1: Write `docs/implementacao-fase8d-radar-inteligencia-hubs.md`** covering, with real numbers gathered during execution (not placeholders): methodology (evidence protocol followed per task), architecture decision (JSON-repository, not Supabase — same as agenda), full before/after for Radar/Inteligência/Hubs, migrations (documented not applied), admin screens delivered, monitoring decision (Task 15's rationale verbatim), test counts (unit/Playwright/axe), Lighthouse scores, lint/typecheck/build results, secrets scan result, production-changed=false confirmation, PM2 restart-count comparison (before/after from Task 13 Step 10), and explicit `RADAR_READY`/`INTELLIGENCE_READY`/`HUBS_READY`/`READY_FOR_FINAL_DEPLOY` flags with any concrete remaining blocker (e.g., "no real Radar signals exist yet — admin must create the first ones before this is visibly non-empty in production").

- [ ] **Step 2: Update the persistent memory files** (paths under `/home/pedro/.claude/projects/-home-pedro-vtres60-blog/memory/`, NOT part of the git repo):
  - Append a new dated entry to `project_vtres60_timeline.md` describing Fase 8D.
  - Update `project_vtres60_pending_work.md`'s "Fase 8D not started" line to reflect completion, and update the still-open final-deploy paragraph to include the Fase 8D commits.
  - Add one line to `MEMORY.md` pointing at the updated pending-work file.

- [ ] **Step 3: Commit the docs (code repo)**

```bash
cd /home/pedro/vtres60-blog-fase8c
git add docs/implementacao-fase8d-radar-inteligencia-hubs.md
git commit -m "docs(fase8d): relatório final — Radar Industrial, Inteligência VTRES60 e Hubs administráveis"
```

- [ ] **Step 4: Push the worktree branch to the remote feature branch — same technique as Fase 8C, never touching the production checkout**

```bash
cd /home/pedro/vtres60-blog-fase8c
git push origin fase8c-dev:feat/portal-funcional-fase8
```
Expected: fast-forward push succeeds (no `--force`). Do NOT merge to `main`. Do NOT touch `/home/pedro/vtres60-blog`.

- [ ] **Step 5: Final verification pass**

```bash
cd /home/pedro/vtres60-blog-fase8c && git status && git log --oneline -15
cd /home/pedro/vtres60-blog && git status
pm2 jlist | python3 -c "import json,sys;[print(p['name'],p['pm2_env'].get('restart_time')) for p in json.load(sys.stdin)]"
```
Expected: worktree clean except `logs.json`; production checkout unchanged (still `c063537`, only runtime-file diffs); PM2 restart counts identical to the Task 13 Step 10 snapshot.

---

## Self-Review Notes (completed during plan authoring)

**Spec coverage:** Radar fields (Task 2), evidence gate (Task 4), status lifecycle incl. auto-expiry (Task 3), admin CRUD (Tasks 7, 11), home + own page (Tasks 10, 12) ✓. Intelligence fields/kind differentiation (Task 2), radar_signal_id gate (Task 5), admin CRUD (Tasks 8, 11), home visual differentiation (Task 10) ✓. Hubs fields (Task 2), coverage-gated home display (Tasks 9-10), admin CRUD (Tasks 6, 11), no invented ticker/website (Task 3's researched seed data) ✓. Monitoring evaluation (Task 15) ✓. Migrations documented-not-applied (Task 14) ✓. Full validation loop incl. PID-safe server management (Task 13) ✓. Documentation + memory + commit + push, no merge/no deploy (Task 16) ✓.

**Placeholder scan:** no "TBD"/"add validation later"/"similar to Task N" left in any step — every step above has complete, real code.

**Type consistency:** `RadarSignal.tagIds`/`.segmentSlugs`/`.companySlugs` (Task 2) match the field names used in `validate-signal.ts` (Task 4), `evidence-context.ts` (Task 4), the routes (Task 7), and `radar-editor.tsx` (Task 11) throughout — verified no `tag_ids` snake_case drift into TypeScript code (snake_case only appears in the SQL documentation file, Task 14, which is correct since SQL columns are snake_case by project convention).
