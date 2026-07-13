-- VTRES60 Blog — metadata de provenance da imagem editorial (Fase 4).
-- Executar no SQL Editor do Supabase apos supabase-schema.sql e
-- supabase-queue-schema.sql.
--
-- Ate a Fase 4, featured_image guardava um hotlink externo (og:image da
-- fonte, URL do Replicate ou do Pexels) sem download, processamento,
-- deduplicacao ou rastreabilidade. A partir desta migracao, novas
-- publicacoes passam por download + processamento + upload para o
-- Supabase Storage (bucket "editorial-images", ver configuracao local
-- correspondente), e featured_image passa a ser a URL do Storage.
--
-- image_caption (coluna ja existente) e legenda editorial e NAO e
-- reaproveitada aqui para credito de imagem — sao conceitos diferentes.
-- source_url (coluna ja existente) e a fonte da NOTICIA, nao da imagem —
-- por isso image_source_url e uma coluna separada.
--
-- Todas as colunas sao NULLABLE: posts historicos (criados antes desta
-- migracao, incluindo os publicados pelo worker legado) continuam validos
-- sem preenchimento retroativo — nenhum backfill e feito por esta
-- migracao.
alter table public.posts
  add column if not exists image_source_url text,
  add column if not exists image_credit text,
  add column if not exists image_origin text,
  add column if not exists image_hash text,
  add column if not exists image_width integer,
  add column if not exists image_height integer;

-- Conjunto controlado de origens para NOVAS publicacoes da pipeline do
-- agente. "placeholder" e "unknown" nao sao estados normais de uma
-- publicacao nova (ver image-processor.ts) — imagem sem tier aprovado
-- gera image_pipeline_failed e a noticia nao e publicada, em vez de cair
-- num desses dois valores. A constraint permite NULL para nao quebrar
-- posts historicos, que nunca tiveram este campo preenchido.
alter table public.posts drop constraint if exists posts_image_origin_check;
alter table public.posts
  add constraint posts_image_origin_check
  check (image_origin is null or image_origin in ('source_og', 'generated_replicate', 'pexels', 'owned'));

create index if not exists posts_image_hash_idx on public.posts (image_hash);
