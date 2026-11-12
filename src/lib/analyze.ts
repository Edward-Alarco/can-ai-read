import { translator, type Locale } from './i18n';
import { load } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { safeFetch, normalizeUrl } from './safe-fetch';
import { robotsDecision } from './robots';
import { reportFromFacts, copy, type AuditFacts, type Evidence } from './diagnostics';
export type { Finding } from './diagnostics';
export async function analyze(input: string, fetchPage: typeof safeFetch = safeFetch, locale: Locale = 'en') {
  const t = translator(locale), started = performance.now();
  const requested = normalizeUrl(input);
  const signal = AbortSignal.timeout(18_000);
  const page = await fetchPage(requested.href, signal);
  if (page.status < 200 || page.status >= 300) throw new Error(t`El servidor respondió HTTP ${page.status}. No pudimos obtener una página válida; esto no demuestra que todos los agentes estén bloqueados.`);
  if (!(page.headers['content-type'] || '').includes('text/html')) throw new Error(t('Esta URL no devuelve una página HTML. Prueba con una página pública de tu web.'));
  const $ = load(page.body, { sourceCodeLocationInfo: true });
  const line = (el: AnyNode) => (el as AnyNode & { sourceCodeLocation?: { startLine?: number } }).sourceCodeLocation?.startLine;
  const evidenceFor = (selector: string): Evidence[] => $(selector).toArray().slice(0,12).map(el=>({location:selector,value:$.html(el).slice(0,1000),line:line(el)}));
  const title = $('title').first().text().trim(), description = $('meta[name="description"]').attr('content')||'';
  const robotMeta = $('meta').filter((_,el)=>['robots','googlebot','bingbot'].includes(($(el).attr('name')||'').toLowerCase()));
  const directives = [robotMeta.map((_,el)=>`${$(el).attr('name')}: ${$(el).attr('content')}`).get().join('; '),page.headers['x-robots-tag']||''].filter(Boolean).join('; ');
  const canonical = $('link[rel="canonical"]').attr('href')||'';
  let canonicalUrl = ''; try { canonicalUrl=canonical?new URL(canonical,page.url).href:''; } catch { /* Report malformed canonical rather than failing the audit. */ }
  const headings = $('h1,h2,h3,h4,h5,h6').toArray().map(el=>({level:Number(el.type==='tag'?el.name.slice(1):0),text:$(el).text().replace(/\s+/g,' ').trim().slice(0,400),line:line(el)}));
  const declaredTypes = (value: unknown): string[] => {
    if (!value || typeof value!=='object') return [];
    if (Array.isArray(value)) return value.flatMap(declaredTypes).slice(0,50);
    const obj=value as Record<string,unknown>;
    return [...(typeof obj['@type']==='string'?[obj['@type']]:Array.isArray(obj['@type'])?obj['@type'].filter((v):v is string=>typeof v==='string'):[]),...declaredTypes(obj['@graph'])].slice(0,50);
  };
  const jsonLd=$('script[type="application/ld+json"]').toArray().map(el=>{
    const snippet=$(el).text().slice(0,1000);
    try { return {valid:true,types:declaredTypes(JSON.parse($(el).text())),snippet,line:line(el)}; }
    catch { return {valid:false,types:[],snippet,line:line(el)}; }
  });
  const resourceUrl=(raw: string) => { if (!raw.trim()) return ''; try { const u=new URL(raw,page.url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:''; } catch {return '';} };
  const images=$('img').toArray().map(el=>({src:resourceUrl($(el).attr('src')||$(el).attr('data-src')||''),alt:$(el).attr('alt')??null,line:line(el)}));
  const resources=[...$('script[src]').toArray().map(el=>({kind:'JavaScript',url:resourceUrl($(el).attr('src')||'')})),...$('link[rel="stylesheet"][href]').toArray().map(el=>({kind:'CSS',url:resourceUrl($(el).attr('href')||'')}))].filter(r=>r.url).filter((r,i,all)=>all.findIndex(v=>v.url===r.url)===i).slice(0,12);
  const generator=$('meta[name="generator"]').attr('content')||'';
  const platform: AuditFacts['platform'] = /wordpress|wp-content|wp-includes/i.test(generator+' '+resources.map(r=>r.url).join(' '))?'wordpress':/shopify/i.test(generator+' '+resources.map(r=>r.url).join(' '))?'shopify':/astro/i.test(generator)||resources.some(r=>r.url.includes('/_astro/'))?'astro':page.body.includes('__NEXT_DATA__')||resources.some(r=>r.url.includes('/_next/'))?'next':'unknown';
  const metadataEvidence=[...evidenceFor('title'),...evidenceFor('meta[name="description"]')];
  const indexEvidence: Evidence[]=robotMeta.toArray().map(el=>({location:'meta robots',value:$.html(el).slice(0,1000),line:line(el)}));
  if(page.headers['x-robots-tag'])indexEvidence.push({location:'HTTP X-Robots-Tag',value:page.headers['x-robots-tag']});
  const headingEvidence=headings.slice(0,12).map(h=>({location:`h${h.level}`,value:h.text,line:h.line}));
  $('script,style,noscript,template,nav,footer,header,[hidden],[aria-hidden="true"]').remove();
  const main=$('main').length?$('main'):$('article').length?$('article'):$('body');
  const text=main.text().replace(/\s+/g,' ').trim(),words=text?text.split(/\s+/).length:0;
  const links=$('a[href]').toArray().flatMap(el=>{const u=resourceUrl($(el).attr('href')||'');return u&&new URL(u).origin===new URL(page.url).origin?[{url:u,text:$(el).text().trim().slice(0,180),line:line(el)}]:[];});
  const internalLinks=new Set(links.map(l=>l.url)).size;
  const robotsUrl=new URL('/robots.txt',page.url).href;
  let robots: Awaited<ReturnType<typeof safeFetch>>|null=null;
  try { robots=await fetchPage(robotsUrl,signal,500_000); } catch { /* Unknown permissions remain unknown. */ }
  const validRobots=robots?.status===200&&!(robots.headers['content-type']||'').includes('text/html');
  const agents=[{name:'OAI-SearchBot',provider:'OpenAI',purpose:t('Búsqueda')},{name:'Claude-SearchBot',provider:'Anthropic',purpose:t('Búsqueda')},{name:'Googlebot',provider:'Google',purpose:t('Búsqueda')},{name:'GPTBot',provider:'OpenAI',purpose:t('Entrenamiento')},{name:'ClaudeBot',provider:'Anthropic',purpose:t('Entrenamiento')}].map(agent=>({...agent,...(validRobots?robotsDecision(robots!.body,agent.name,new URL(page.url).pathname+new URL(page.url).search,locale):robots?.status===404?{state:'allowed',evidence:t('robots.txt devuelve 404: no se encontraron restricciones en este archivo.') }:{state:'unknown',evidence:robots?t`robots.txt no verificable (HTTP ${robots.status}).`:t('No pudimos recuperar robots.txt durante esta prueba.')})}));
  return reportFromFacts({url:page.url,requestedUrl:requested.href,analyzedAt:new Date().toISOString(),statusCode:page.status,redirects:page.redirects,htmlBytes:Buffer.byteLength(page.body),elapsedMs:Math.round(performance.now()-started),title,description,directives,canonical,canonicalUrl,headings,words,internalLinks,excerpt:text.slice(0,16000),jsonLd,images,agents,robotsUrl,robotsExcerpt:validRobots?robots!.body.slice(0,6000):`HTTP ${robots?.status??'unknown'}`,platform,resources,evidence:{server:[{location:page.url,value:`HTTP ${page.status}\nContent-Type: ${page.headers['content-type']||''}`}],text:[{location:main.is('main')?'main':main.is('article')?'article':'body',value:text.slice(0,1000)}],indexing:indexEvidence,metadata:metadataEvidence,headings:headingEvidence,canonical:canonical?[{location:'link[rel="canonical"]',value:canonical}]:[],links:links.slice(0,12).map(l=>({location:l.url,value:l.text||copy(locale,'Link without text','Enlace sin texto'),line:l.line})),schema:jsonLd.slice(0,12).map((j,i)=>({location:`script[type="application/ld+json"] #${i+1}`,value:`${j.valid?'JSON OK':'JSON INVALID'}${j.types.length?' · '+j.types.join(', '):''}\n${j.snippet}`,line:j.line})),images:images.filter(i=>i.alt===null).slice(0,12).map(i=>({location:i.src||'img',value:copy(locale,'Missing alt attribute. Review whether the image is informative or decorative.','Sin atributo alt. Revisa si la imagen es informativa o decorativa.'),line:i.line}))}},locale);
}
