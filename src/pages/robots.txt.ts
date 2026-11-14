import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const origin = new URL('/', site!).origin;
  const body = `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
