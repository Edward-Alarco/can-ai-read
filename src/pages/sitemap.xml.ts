import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const loc = new URL('/', site!).href;
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${loc}</loc>\n  </url>\n</urlset>\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
