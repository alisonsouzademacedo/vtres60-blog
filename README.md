# VTRES60 Industria

Portal editorial de noticias e inteligencia para a industria brasileira.

## Desenvolvimento

```bash
npm install
npm run dev
```

Valide antes de publicar:

```bash
npm run typecheck
npm run lint
npm run build
```

## Publicacao em /blog

O projeto esta preparado para rodar em `https://www.vtres60.com.br/blog`.

Variaveis esperadas no servidor:

```env
ADMIN_PASSWORD=troque-por-uma-senha-forte
NEXT_PUBLIC_SITE_URL=https://www.vtres60.com.br/blog
NEXT_PUBLIC_BASE_PATH=/blog
```

Se rodar temporariamente na raiz do dominio, deixe `NEXT_PUBLIC_BASE_PATH` vazio e ajuste `NEXT_PUBLIC_SITE_URL`.

## Pontos de producao

- O painel administrativo exige `ADMIN_PASSWORD`.
- Conteudos, leads, logs e configuracoes ainda sao gravados em `src/content`.
- Uploads ainda sao gravados em `public/uploads`.
- Em servidor proprio com disco persistente isso funciona, mas em hospedagem serverless e containers efemeros esses dados podem se perder.
- Antes de escalar, migre leads/uploads/conteudo para banco, CMS ou storage persistente.
- A newsletter capta leads, mas ainda nao dispara emails. Integre Brevo, Mailchimp, HubSpot, RD Station, Resend ou outro provedor.

## Arquitetura editorial

Todo conteudo editorial vive em `/noticias/[slug]`. Os formatos `noticia`, `analise`, `guia` e `case` sao metadados do conteudo. Componentes acessam conteudo pela camada de dados, preparada para ser substituida por um adaptador de CMS.

## Checklist antes de deixar online

- Definir `ADMIN_PASSWORD` forte no servidor.
- Confirmar proxy/rewrite para `/blog`.
- Confirmar permissao de escrita para `src/content` e `public/uploads`, se mantiver armazenamento local.
- Configurar Analytics/Search Console.
- Testar login, criacao de conteudo, upload, backup e cadastro de newsletter no dominio real.
- Confirmar politica de privacidade e processo de descadastro da newsletter.
