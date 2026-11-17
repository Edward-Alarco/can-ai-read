import type { APIRoute } from 'astro';
import { captureDesktopScreenshot } from '../../lib/screenshot';
import { isAllowedRequestOrigin } from '../../lib/request-origin';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isAllowedRequestOrigin(request)) return new Response(null, { status: 403 });
  if (!request.headers.get('content-type')?.includes('application/json')) return new Response(null, { status: 415 });
  try {
    const raw = await request.text();
    if (raw.length > 4096) return new Response(null, { status: 413 });
    const data = JSON.parse(raw);
    if (!data || typeof data.url !== 'string' || !data.url.trim()) return new Response(null, { status: 400 });
    const image = await captureDesktopScreenshot(data.url.trim());
    return new Response(new Blob([image as BlobPart], { type: 'image/webp' }), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline; filename="desktop-screenshot.webp"',
      },
    });
  } catch {
    return new Response(null, { status: 422, headers: { 'Cache-Control': 'no-store' } });
  }
};
