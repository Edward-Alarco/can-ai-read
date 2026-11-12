import type { APIRoute } from 'astro';
import { analyze } from '../../lib/analyze';
import { resolveLocale, translator } from '../../lib/i18n';
export const prerender = false;
export const POST: APIRoute = async ({ request, cookies }) => {
  let locale = resolveLocale(request.headers.get('accept-language'), cookies.get('language')?.value);
  let t = translator(locale);
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Language': locale } });
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: t("Origen no permitido.") }, 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return reply({ error: t("Formato no admitido.") }, 415);
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) { await reader.cancel(); return reply({ error: t("La solicitud es demasiado grande.") }, 413); }
      chunks.push(value);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    if (raw.length > 4096) return reply({ error: t("La solicitud es demasiado grande.") }, 413);
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return reply({ error: t('Introduce una URL válida.') }, 400);
    if (data.language === 'en' || data.language === 'es') { locale = data.language; t = translator(locale); }
    if (typeof data.url !== 'string' || !data.url.trim()) return reply({ error: t("Introduce una URL válida.") }, 400);
    return reply(await analyze(data.url.trim(), undefined, locale));
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof TypeError && error.message === 'Invalid URL')) return reply({ error: t('Introduce una URL válida.') }, 400);
    const message = error instanceof Error ? error.message : '';
    return reply({ error: /timeout|abort/i.test(message) ? t('La web tardó demasiado en responder. Vuelve a intentarlo.') : message.startsWith('fetch failed') || /ENOTFOUND|EAI_AGAIN|ECONN|certificate/i.test(message) ? t('No pudimos conectar con esa web. Comprueba la dirección y vuelve a intentarlo.') : t(message) || t('No pudimos completar el análisis.') }, 422);
  }
};
