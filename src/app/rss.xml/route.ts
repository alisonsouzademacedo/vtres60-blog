import { contentRepository } from "@/services/cms";
import { configRepository } from "@/services/config";

const escapeCdata = (value: string) => value.replace(/]]>/g, "]]]]><![CDATA[>");

export async function GET() {
  const [articles, settings, seo] = await Promise.all([
    contentRepository.listArticles(),
    configRepository.getSettings(),
    configRepository.getSeo(),
  ]);
  const base = seo.canonicalBaseUrl.replace(/\/+$/, "");
  const items = articles
    .map(
      (article) =>
        `<item><title><![CDATA[${escapeCdata(article.title)}]]></title><link>${base}/noticias/${article.slug}</link><guid>${base}/noticias/${article.slug}</guid><description><![CDATA[${escapeCdata(article.excerpt)}]]></description><pubDate>${new Date(article.publishedAt).toUTCString()}</pubDate></item>`,
    )
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${settings.portalName}</title><link>${base}</link><description><![CDATA[${escapeCdata(seo.defaultDescription)}]]></description><language>pt-BR</language>${items}</channel></rss>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
