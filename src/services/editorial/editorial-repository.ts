import { randomUUID } from "node:crypto";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import type {
  EducationalArticle,
  EditorialCollection,
  ManagedAuthor,
  ManagedCategory,
  ManagedPost,
  ManagedTag,
} from "@/types/editorial";

type RecordMap = {
  posts: ManagedPost;
  "educational-articles": EducationalArticle;
  categories: ManagedCategory;
  authors: ManagedAuthor;
  tags: ManagedTag;
};

const now = () => new Date().toISOString();
const UNIQUE_VIOLATION = "23505";
const DUPLICATE_SLUG_ERROR = "Este slug já está em uso.";

const TABLES: Record<EditorialCollection, string> = {
  posts: "posts",
  "educational-articles": "educational_articles",
  categories: "categories",
  authors: "authors",
  tags: "tags",
};

// ---- mapeamento camelCase (app) <-> snake_case (Postgres) ----
// Cada entrada e [chave TS, coluna no banco]. Ver supabase-schema.sql.

type FieldMap<T> = ReadonlyArray<readonly [keyof T & string, string]>;

function makeMapper<T>(fields: FieldMap<T>) {
  return {
    fromRow(row: Record<string, unknown>): T {
      const record = {} as T;
      for (const [key, column] of fields) (record as Record<string, unknown>)[key] = row[column];
      return record;
    },
    toRow(record: Partial<T>): Record<string, unknown> {
      const row: Record<string, unknown> = {};
      for (const [key, column] of fields) {
        if (key in record) row[column] = (record as Record<string, unknown>)[key];
      }
      return row;
    },
  };
}

const postFields: FieldMap<ManagedPost> = [
  ["id", "id"], ["title", "title"], ["slug", "slug"], ["excerpt", "excerpt"], ["content", "content"],
  ["featuredImage", "featured_image"], ["imageCaption", "image_caption"], ["imageAlt", "image_alt"],
  ["categoryId", "category_id"], ["segmentSlugs", "segment_slugs"], ["tagIds", "tag_ids"],
  ["authorId", "author_id"], ["publishedAt", "published_at"], ["scheduledAt", "scheduled_at"],
  ["readingTime", "reading_time"], ["status", "status"], ["featured", "featured"],
  ["mainStory", "main_story"], ["displayOrder", "display_order"], ["sourceName", "source_name"],
  ["sourceUrl", "source_url"], ["contentType", "content_type"], ["impact", "impact"],
  ["companies", "companies"], ["cta", "cta"], ["seo", "seo"], ["faq", "faq"],
  // Fase 4 — provenance da imagem. Nullable no banco; ausentes em posts
  // historicos (fromRow devolve undefined para essas chaves nesse caso).
  ["imageSourceUrl", "image_source_url"], ["imageCredit", "image_credit"],
  ["imageOrigin", "image_origin"], ["imageHash", "image_hash"],
  ["imageWidth", "image_width"], ["imageHeight", "image_height"],
  ["createdAt", "created_at"], ["updatedAt", "updated_at"],
];

const educationalArticleFields: FieldMap<EducationalArticle> = [
  ["id", "id"], ["title", "title"], ["slug", "slug"], ["excerpt", "excerpt"], ["content", "content"],
  ["featuredImage", "featured_image"], ["imageAlt", "image_alt"], ["categoryId", "category_id"],
  ["tagIds", "tag_ids"], ["primaryKeyword", "primary_keyword"], ["secondaryKeywords", "secondary_keywords"],
  ["authorId", "author_id"], ["readingTime", "reading_time"], ["status", "status"],
  ["publishedAt", "published_at"], ["scheduledAt", "scheduled_at"],
  ["relatedArticleIds", "related_article_ids"], ["relatedPillarSlugs", "related_pillar_slugs"],
  ["cta", "cta"], ["seo", "seo"], ["faq", "faq"], ["createdAt", "created_at"], ["updatedAt", "updated_at"],
];

const categoryFields: FieldMap<ManagedCategory> = [
  ["id", "id"], ["name", "name"], ["slug", "slug"], ["description", "description"], ["image", "image"],
  ["icon", "icon"], ["color", "color"], ["menuOrder", "menu_order"], ["showInMenu", "show_in_menu"],
  ["showOnHome", "show_on_home"], ["metaTitle", "meta_title"], ["metaDescription", "meta_description"],
  ["keywords", "keywords"], ["seoIntroduction", "seo_introduction"],
  ["relatedArticleIds", "related_article_ids"], ["relatedPillarSlugs", "related_pillar_slugs"],
  ["page", "page"], ["createdAt", "created_at"], ["updatedAt", "updated_at"],
];

const authorFields: FieldMap<ManagedAuthor> = [
  ["id", "id"], ["name", "name"], ["role", "role"], ["photo", "photo"], ["bio", "bio"],
  ["linkedin", "linkedin"], ["email", "email"], ["slug", "slug"],
  ["createdAt", "created_at"], ["updatedAt", "updated_at"],
];

const tagFields: FieldMap<ManagedTag> = [
  ["id", "id"], ["name", "name"], ["slug", "slug"], ["description", "description"],
  ["metaTitle", "meta_title"], ["metaDescription", "meta_description"],
  ["createdAt", "created_at"], ["updatedAt", "updated_at"],
];

const mappers = {
  posts: makeMapper(postFields),
  "educational-articles": makeMapper(educationalArticleFields),
  categories: makeMapper(categoryFields),
  authors: makeMapper(authorFields),
  tags: makeMapper(tagFields),
} as const;

// Reexportados apenas para uso pelo script de migracao (scripts/migrate-to-supabase.ts),
// que precisa da mesma conversao camelCase <-> snake_case usada aqui.
export const EDITORIAL_TABLES = TABLES;
export const editorialMappers = mappers;

// ---- operacoes genericas, uma implementacao por verbo para as 5 colecoes ----

async function list<K extends EditorialCollection>(collection: K): Promise<RecordMap[K][]> {
  noStore();
  const { data, error } = await supabaseAdmin
    .from(TABLES[collection])
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const mapper = mappers[collection];
  return (data ?? []).map((row) => mapper.fromRow(row)) as RecordMap[K][];
}

async function getOne<K extends EditorialCollection>(collection: K, value: string): Promise<RecordMap[K] | undefined> {
  noStore();
  const table = TABLES[collection];
  const mapper = mappers[collection];
  const byId = await supabaseAdmin.from(table).select("*").eq("id", value).maybeSingle();
  if (byId.error) throw new Error(byId.error.message);
  if (byId.data) return mapper.fromRow(byId.data) as RecordMap[K];
  const bySlug = await supabaseAdmin.from(table).select("*").eq("slug", value).maybeSingle();
  if (bySlug.error) throw new Error(bySlug.error.message);
  return bySlug.data ? (mapper.fromRow(bySlug.data) as RecordMap[K]) : undefined;
}

async function createRecord<K extends EditorialCollection>(
  collection: K,
  input: Omit<RecordMap[K], "id" | "createdAt" | "updatedAt">,
): Promise<RecordMap[K]> {
  const timestamp = now();
  const record = { ...input, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp } as RecordMap[K];
  const row = mappers[collection].toRow(record);
  const { data, error } = await supabaseAdmin.from(TABLES[collection]).insert(row).select().single();
  if (error) throw new Error(error.code === UNIQUE_VIOLATION ? DUPLICATE_SLUG_ERROR : error.message);
  return mappers[collection].fromRow(data) as RecordMap[K];
}

async function updateRecord<K extends EditorialCollection>(
  collection: K,
  recordId: string,
  patch: Partial<RecordMap[K]>,
): Promise<RecordMap[K] | undefined> {
  const rest = { ...(patch as Record<string, unknown>) };
  delete rest.id;
  delete rest.createdAt;
  const row = mappers[collection].toRow({ ...rest, updatedAt: now() } as Partial<RecordMap[K]>);
  const { data, error } = await supabaseAdmin
    .from(TABLES[collection])
    .update(row)
    .eq("id", recordId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.code === UNIQUE_VIOLATION ? DUPLICATE_SLUG_ERROR : error.message);
  return data ? (mappers[collection].fromRow(data) as RecordMap[K]) : undefined;
}

async function removeRecord<K extends EditorialCollection>(collection: K, recordId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from(TABLES[collection]).delete().eq("id", recordId).select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

async function duplicateRecord<K extends "posts" | "educational-articles">(
  collection: K,
  recordId: string,
): Promise<RecordMap[K] | undefined> {
  const source = await getOne(collection, recordId);
  if (!source) return undefined;
  const base = `${(source as unknown as { slug: string }).slug}-copia`;
  const timestamp = now();
  let slug = base;
  let counter = 2;
  for (;;) {
    const copy = {
      ...source,
      id: randomUUID(),
      title: `${(source as unknown as { title: string }).title} (cópia)`,
      slug,
      status: "draft",
      featured: false,
      mainStory: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    } as RecordMap[K];
    const row = mappers[collection].toRow(copy);
    const { data, error } = await supabaseAdmin.from(TABLES[collection]).insert(row).select().single();
    if (!error) return mappers[collection].fromRow(data) as RecordMap[K];
    if (error.code !== UNIQUE_VIOLATION) throw new Error(error.message);
    slug = `${base}-${counter++}`;
  }
}

export const editorialRepository = {
  listPosts: () => list("posts"),
  getPost: (value: string) => getOne("posts", value),
  createPost: (input: Omit<ManagedPost, "id" | "createdAt" | "updatedAt">) => createRecord("posts", input),
  updatePost: (id: string, patch: Partial<ManagedPost>) => updateRecord("posts", id, patch),
  deletePost: (id: string) => removeRecord("posts", id),
  duplicatePost: (id: string) => duplicateRecord("posts", id),

  listEducationalArticles: () => list("educational-articles"),
  getEducationalArticle: (value: string) => getOne("educational-articles", value),
  createEducationalArticle: (input: Omit<EducationalArticle, "id" | "createdAt" | "updatedAt">) =>
    createRecord("educational-articles", input),
  updateEducationalArticle: (id: string, patch: Partial<EducationalArticle>) =>
    updateRecord("educational-articles", id, patch),
  deleteEducationalArticle: (id: string) => removeRecord("educational-articles", id),
  duplicateEducationalArticle: (id: string) => duplicateRecord("educational-articles", id),

  listCategories: () => list("categories"),
  getCategory: (value: string) => getOne("categories", value),
  createCategory: (input: Omit<ManagedCategory, "id" | "createdAt" | "updatedAt">) => createRecord("categories", input),
  updateCategory: (id: string, patch: Partial<ManagedCategory>) => updateRecord("categories", id, patch),
  deleteCategory: (id: string) => removeRecord("categories", id),

  listAuthors: () => list("authors"),
  getAuthor: (value: string) => getOne("authors", value),
  createAuthor: (input: Omit<ManagedAuthor, "id" | "createdAt" | "updatedAt">) => createRecord("authors", input),
  updateAuthor: (id: string, patch: Partial<ManagedAuthor>) => updateRecord("authors", id, patch),
  deleteAuthor: (id: string) => removeRecord("authors", id),

  listTags: () => list("tags"),
  getTag: (value: string) => getOne("tags", value),
  createTag: (input: Omit<ManagedTag, "id" | "createdAt" | "updatedAt">) => createRecord("tags", input),
  updateTag: (id: string, patch: Partial<ManagedTag>) => updateRecord("tags", id, patch),
  deleteTag: (id: string) => removeRecord("tags", id),
};
