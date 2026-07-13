import { promises as fs } from "node:fs";
import path from "node:path";
import { unstable_noStore as noStore } from "next/cache";
import type { ConfigMap, ConfigName } from "@/types/admin";

const contentDirectory = path.join(process.cwd(), "src", "content");

function mergeDeep<T>(current: T, patch: Partial<T>): T {
  if (Array.isArray(patch)) return patch as T;
  if (!patch || typeof patch !== "object") return patch as T;
  const result = { ...(current as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    const previous = result[key];
    result[key] = value && typeof value === "object" && !Array.isArray(value) && previous && typeof previous === "object" && !Array.isArray(previous)
      ? mergeDeep(previous, value)
      : value;
  }
  return result as T;
}

async function readConfig<K extends ConfigName>(name: K): Promise<ConfigMap[K]> {
  noStore();
  const raw = await fs.readFile(path.join(contentDirectory, `${name}.json`), "utf8");
  return JSON.parse(raw) as ConfigMap[K];
}

async function updateConfig<K extends ConfigName>(name: K, patch: Partial<ConfigMap[K]>): Promise<ConfigMap[K]> {
  const current = await readConfig(name);
  const next = mergeDeep(current, patch);
  const target = path.join(contentDirectory, `${name}.json`);
  const temporary = `${target}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return next;
}

export const configRepository = {
  getSettings: () => readConfig("settings"), updateSettings: (patch: Partial<ConfigMap["settings"]>) => updateConfig("settings", patch),
  getBranding: () => readConfig("branding"), updateBranding: (patch: Partial<ConfigMap["branding"]>) => updateConfig("branding", patch),
  getSeo: () => readConfig("seo"), updateSeo: (patch: Partial<ConfigMap["seo"]>) => updateConfig("seo", patch),
  getHome: () => readConfig("home"), updateHome: (patch: Partial<ConfigMap["home"]>) => updateConfig("home", patch),
};
