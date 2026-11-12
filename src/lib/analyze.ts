import { translator, type Locale } from './i18n';
import { load } from 'cheerio';
import { safeFetch, normalizeUrl } from './safe-fetch';
import { robotsDecision } from './robots';
export type Finding = { title: string; state: 'pass' | 'warning' | 'info'; evidence: string; action: string };
export async function analyze(input: string, fetchPage: typeof safeFetch = safeFetch, locale: Locale = 'en') {
  const t = translator(locale);
  const requested = normalizeUrl(input);
  const signal = AbortSignal.timeout(18_000);
  const page = await fetchPage(requested.href, signal);
  if (page.status < 200 || page.status >= 300) throw new Error(t`El servidor respondió HTTP ${page.status}. No pudimos obtener una página válida; esto no demuestra que todos los agentes estén bloqueados.`);
  if (!(page.headers['content-type'] || '').includes('text/html')) throw new Error(t("Esta URL no devuelve una página HTML. Prueba con una página pública de tu web."));
  const $ = load(page.body);
  const title = $('title').first().text().trim();
  const description = $('meta[name="description"]').attr('content') || '';
  const metaRobots = $('meta').filter((_, el) => ['robots','googlebot','bingbot'].includes(($(el).attr('name') || '').toLowerCase())).map((_,el) => `${$(el).attr('name')}: ${$(el).attr('content')}`).get().join('; ');
  const directives = [metaRobots, page.headers['x-robots-tag'] || ''].filter(Boolean).join('; ');
  const canonical = $('link[rel="canonical"]').attr('href') || '';
  let canonicalUrl = ''; try { canonicalUrl = canonical ? new URL(canonical, page.url).href : ''; } catch { /* Invalid canonical is reported below. */ }
  const h1 = $('h1').map((_,el) => $(el).text().trim()).get();
  const structuredData = $('script[type="application/ld+json"]').length;
  const invalidJsonLd = $('script[type="application/ld+json"]').toArray().filter(el => { try { JSON.parse($(el).text()); return false; } catch { return true; } }).length;
  $('script,style,noscript,template,nav,footer,header,[hidden],[aria-hidden="true"]').remove();
  const main = $('main').length ? $('main') : $('article').length ? $('article') : $('body');
  const text = main.text().replace(/\s+/g, ' ').trim();
  const words = text ? text.split(/\s+/).length : 0;
  const internalLinks = new Set($('a[href]').toArray().flatMap(el => { try { const u = new URL($(el).attr('href')!, page.url); return u.origin === new URL(page.url).origin && ['https:','http:'].includes(u.protocol) ? [u.href] : []; } catch { return []; } })).size;
  const robotsUrl = new URL('/robots.txt', page.url).href;
  let robots: Awaited<ReturnType<typeof safeFetch>> | null = null;
  let robotsError = '';
  try { robots = await fetchPage(robotsUrl, signal, 500_000); } catch { robotsError = t("No pudimos recuperar robots.txt durante esta prueba."); }
  const validRobots = robots?.status === 200 && !(robots.headers['content-type'] || '').includes('text/html');
  const missingRobots = robots?.status === 404;
  const agents = [
    { name: 'OAI-SearchBot', provider: 'OpenAI', purpose: t("Búsqueda") },
    { name: 'Claude-SearchBot', provider: 'Anthropic', purpose: t("Búsqueda") },
    { name: 'Googlebot', provider: 'Google', purpose: t("Búsqueda") },
    { name: 'GPTBot', provider: 'OpenAI', purpose: t("Entrenamiento") },
    { name: 'ClaudeBot', provider: 'Anthropic', purpose: t("Entrenamiento") },
  ].map(agent => ({ ...agent, ...(validRobots ? robotsDecision(robots!.body, agent.name, new URL(page.url).pathname + new URL(page.url).search, locale) : missingRobots ? { state: 'allowed', evidence: t("robots.txt devuelve 404: no se encontraron restricciones en este archivo.") } : { state: 'unknown', evidence: robotsError || t`robots.txt no verificable (HTTP ${robots?.status ?? t("desconocido")}).` }) }));
  const findings: Finding[] = [
    { title: t("Respuesta del servidor"), state: 'pass', evidence: t`HTTP ${page.status} · ${page.redirects} redirecciones · ${(Buffer.byteLength(page.body) / 1024).toFixed(1)} KB de HTML`, action: t("La URL respondió correctamente a nuestro analizador.") },
    { title: t("Texto en el HTML inicial"), state: words < 80 ? 'warning' : 'pass', evidence: t`${words} palabras extraídas del contenido principal.`, action: words < 80 ? t("Revisa si el contenido depende de JavaScript, imágenes o interacciones. No ejecutamos JavaScript en esta versión.") : t("El HTML inicial contiene texto extraíble. Revisa la vista de lectura para comprobar su utilidad.") },
    { title: t("Directivas de indexación"), state: /\b(noindex|none|nosnippet)\b/i.test(directives) ? 'warning' : 'pass', evidence: directives || t("No detectamos restricciones en meta robots ni X-Robots-Tag."), action: t("Comprueba que las directivas coincidan con tu intención. Ausencia de restricciones no confirma indexación.") },
    { title: t("Título y descripción"), state: title && description ? 'pass' : 'warning', evidence: t`Título: ${title || t("ausente")}. Descripción: ${description || t("ausente")}`, action: t("Usa un título descriptivo y un resumen útil para las personas que encuentran esta página.") },
    { title: t("Encabezado principal"), state: h1.length === 1 ? 'pass' : 'info', evidence: t`${h1.length} encabezados H1 detectados${h1[0] ? ': ' + h1[0] : '.'}`, action: t("Una estructura clara facilita la navegación. La cantidad de H1 no determina por sí sola la visibilidad en IA.") },
    { title: t("URL canónica"), state: canonical && !canonicalUrl ? 'warning' : canonicalUrl && canonicalUrl !== page.url ? 'info' : 'pass', evidence: canonicalUrl || (canonical ? t("La URL canónica no es válida.") : t("Sin canonical declarado.")), action: canonicalUrl && canonicalUrl !== page.url ? t("La página señala otra URL como versión principal. Comprueba que sea intencional.") : t("La canonical es una señal de consolidación, no un requisito específico para IA.") },
    { title: t("Enlaces internos extraíbles"), state: internalLinks ? 'pass' : 'info', evidence: t`${internalLinks} destinos internos únicos en el HTML analizado, excluyendo cabecera y navegación.`, action: t("Comprueba que las páginas importantes tengan enlaces HTML accesibles desde otras páginas de tu sitio.") },
    { title: t("Datos estructurados"), state: invalidJsonLd ? 'warning' : 'info', evidence: t`${structuredData} bloques JSON-LD; ${invalidJsonLd} con JSON inválido.`, action: invalidJsonLd ? t("Corrige la sintaxis JSON. Esta prueba no valida el esquema ni la correspondencia con el contenido.") : t("Son opcionales en esta auditoría. No hay un schema especial obligatorio para aparecer en las funciones de IA de Google.") },
  ];
  const searchBlocked = agents.some(a => a.purpose === t("Búsqueda") && a.state === 'blocked');
  return { url: page.url, requestedUrl: requested.href, title: title || new URL(page.url).hostname, analyzedAt: new Date().toISOString(), status: findings.some(f => f.state === 'warning') || searchBlocked ? 'limitations' : 'readable', words, internalLinks, findings, agents, robotsUrl, excerpt: text.slice(0, 16000), scope: t("Una URL · HTML inicial · sin ejecutar JavaScript · sin comprobar indexación ni citas reales") };
}
