-- VTRES60 Blog — bucket de Storage para imagens editoriais (Fase 4).
-- Executar no SQL Editor do Supabase apos supabase-image-metadata-schema.sql.
--
-- Inspecao previa confirmou (client.storage.listBuckets() no projeto real):
-- nenhum bucket existente no projeto. Este e o primeiro bucket de Storage
-- do projeto — nao ha infraestrutura anterior para reaproveitar.
--
-- "editorial-images" e publico: featured_image e servida publicamente e
-- permanentemente pelo portal (nunca signed URL de curta duracao — o
-- portal nao tem mecanismo de renovacao de URL). Upload e feito
-- exclusivamente server-side (ImageProcessor, via supabaseAdmin/
-- service_role) — nunca a partir do browser, entao a policy de escrita
-- fica restrita ao service_role (que ja bypassa RLS por padrao, igual as
-- tabelas editoriais).
insert into storage.buckets (id, name, public)
values ('editorial-images', 'editorial-images', true)
on conflict (id) do nothing;

-- Leitura publica dos objetos do bucket (necessario mesmo com bucket
-- "public": true, para liberar SELECT explicitamente contra RLS de
-- storage.objects).
drop policy if exists "editorial-images public read" on storage.objects;
create policy "editorial-images public read"
  on storage.objects for select
  using (bucket_id = 'editorial-images');

-- Nenhuma policy de INSERT/UPDATE/DELETE para anon/public: toda escrita
-- vem do ImageProcessor via supabaseAdmin (service_role), que bypassa RLS
-- — mesmo padrao ja usado pelas tabelas editoriais (ver supabase-schema.sql).
