import type { APIRoute } from 'astro';
import { captureDesktopScreenshot } from '../../lib/screenshot';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') && request.headers.get('origin') !== origin) return new Response(null, { status: 403 });
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
