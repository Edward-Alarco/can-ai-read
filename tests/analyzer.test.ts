import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, isPublicAddress } from '../src/lib/safe-fetch';
import { robotsDecision } from '../src/lib/robots';

test('rejects private, loopback, mapped and metadata destinations',()=>{
  for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1','0.0.0.0','100.64.0.1']) assert.equal(isPublicAddress(address),false,address);
  assert.equal(isPublicAddress('8.8.8.8'),true);
});
test('normalizes public URLs and rejects risky URL forms',()=>{
  assert.equal(normalizeUrl('github.com/astro#readme').href,'https://github.com/astro');
  for(const url of ['http://localhost/','http://127.1/','http://2130706433','http://[::1]/','https://admin:password@github.com','https://github.com:3000','http://metadata.internal']) assert.throws(()=>normalizeUrl(url),url);
});
test('specific robot groups override wildcard; longest matching path wins',()=>{
  const rules='User-agent: *\nDisallow: /\nUser-agent: OAI-SearchBot\nDisallow: /private/\nAllow: /private/public/';
  assert.equal(robotsDecision(rules,'GPTBot','/').state,'blocked');
  assert.equal(robotsDecision(rules,'OAI-SearchBot','/').state,'allowed');
  assert.equal(robotsDecision(rules,'OAI-SearchBot','/private/a').state,'blocked');
  assert.equal(robotsDecision(rules,'OAI-SearchBot','/private/public/a').state,'allowed');
});
test('equal rules prefer allow; empty disallow permits access',()=>{
  assert.equal(robotsDecision('User-agent: *\nDisallow: /foo\nAllow: /foo','Googlebot','/foo').state,'allowed');
  assert.equal(robotsDecision('User-agent: *\nDisallow:','Googlebot','/').state,'allowed');
});
test('wildcards and end anchor apply to URL path',()=>{
  const rules='User-agent: *\nDisallow: /*.pdf$';
  assert.equal(robotsDecision(rules,'GPTBot','/a.pdf').state,'blocked');
  assert.equal(robotsDecision(rules,'GPTBot','/a.pdf?download=1').state,'allowed');
});

import { analyze } from '../src/lib/analyze';
import type { safeFetch } from '../src/lib/safe-fetch';
const fixtureFetch: typeof safeFetch = async (url) => ({ status: 200, url, redirects: 0, headers: { 'content-type': url.endsWith('/robots.txt') ? 'text/plain' : 'text/html' }, body: url.endsWith('/robots.txt') ? 'User-agent: OAI-SearchBot\nAllow: /\nUser-agent: GPTBot\nDisallow: /' : '<html><head><title>Fixture site</title><meta name="description" content="A useful description"><meta name="robots" content="noindex"><script type="application/ld+json">{bad}</script></head><body><header>Header noise</header><main><h1>Hello</h1><p>Public content</p><a href="/about">About</a><script>alert(1)</script></main></body></html>' });
test('analyzes fixture HTML end to end without inventing access or indexation', async ()=>{
  const report = await analyze('https://github.com/test',fixtureFetch);
  assert.equal(report.title,'Fixture site');
  assert.equal(report.status,'limitations');
  assert.equal(report.internalLinks,1);
  assert.equal(report.agents.find(a=>a.name==='GPTBot')?.state,'blocked');
  assert.equal(report.agents.find(a=>a.name==='OAI-SearchBot')?.state,'allowed');
  assert.equal(report.findings.find(f=>f.title==='Indexing directives')?.state,'warning');
  assert.equal(report.findings.find(f=>f.title==='Structured data')?.state,'warning');
  assert.ok(!report.excerpt.includes('alert'));
  assert.ok(!report.excerpt.includes('Header noise'));
});
test('robots unavailable stays unknown, while missing robots has no declared restrictions',async()=>{
  for(const status of [403,404]) {
    const report=await analyze('https://github.com/test',async(...args)=>args[0].endsWith('/robots.txt')?{status,url:args[0],body:'',headers:{},redirects:0}:fixtureFetch(...args));
    assert.equal(report.agents[0].state,status===404?'allowed':'unknown');
  }
});
test('HTTP failure does not produce a successful report',async()=>{
  await assert.rejects(()=>analyze('https://github.com/test',async(url)=>({status:403,url,headers:{},body:'Forbidden',redirects:0})),/HTTP 403/);
});

import { resolveLocale, translator } from '../src/lib/i18n';
test('language defaults to English without a usable preference',()=>{
  for(const header of [undefined,null,'','*','fr-FR,es;q=0.8','en-US,en;q=0.9,es;q=0.8','es;q=0','es;q=abc','es;q=2']) assert.equal(resolveLocale(header),'en',String(header));
});
test('primary Spanish preference includes regional variants and quality weights',()=>{
  for(const header of ['es','es-PE,es;q=0.9,en;q=0.8','es-ES','en;q=0.5,es-MX;q=0.9']) assert.equal(resolveLocale(header),'es');
  assert.equal(resolveLocale('es;q=0.5,en;q=0.9'),'en');
});
test('explicit saved language overrides detection',()=>{
  assert.equal(resolveLocale('es-PE','en'),'en');
  assert.equal(resolveLocale('en-US','es'),'es');
  assert.equal(resolveLocale(null,'fr'),'en');
});
test('translated templates preserve scanned values instead of translating them',()=>{
  const t=translator('en');
  assert.equal(t`Título: ${'Mi tienda'}. Descripción: ${'Ropa en Lima'}`,'Title: Mi tienda. Description: Ropa en Lima');
  assert.equal(translator('es')('Respuesta del servidor'),'Respuesta del servidor');
});
test('reports localize their interface but preserve the original page content',async()=>{
  const en=await analyze('https://github.com/test',fixtureFetch,'en');
  const es=await analyze('https://github.com/test',fixtureFetch,'es');
  assert.equal(en.findings[0].title,'Server response');
  assert.equal(es.findings[0].title,'Respuesta del servidor');
  assert.match(en.findings[0].evidence,/redirects/);
  assert.match(es.findings[0].evidence,/redirecciones/);
  assert.equal(en.excerpt,es.excerpt);
  assert.equal(en.title,es.title);
  assert.equal(en.agents[0].purpose,'Search');
  assert.equal(es.agents[0].purpose,'Búsqueda');
});

import { POST } from '../src/pages/api/analyze';
import { isAllowedRequestOrigin } from '../src/lib/request-origin';
function apiRequest(language?: string, preference?: string, header?: string) {
  return { request: new Request('https://can-ai-read.example/api/analyze',{ method:'POST', headers:{'Content-Type':'application/json', ...(header ? {'Accept-Language':header} : {})},body:JSON.stringify({url:'http://127.0.0.1',...(language?{language}:{})}) }), cookies:{get:()=>preference ? {value:preference} : undefined} } as unknown as Parameters<typeof POST>[0];
}
test('API validation errors use English by default',async()=>{
  const response=await POST(apiRequest());
  assert.equal(response.headers.get('Content-Language'),'en');
  assert.equal((await response.json()).error,'We can only analyze public websites.');
});
test('API errors follow Spanish detection and explicit English override',async()=>{
  const es=await POST(apiRequest(undefined,undefined,'es-PE'));
  assert.equal(es.headers.get('Content-Language'),'es');
  assert.equal((await es.json()).error,'Solo podemos analizar sitios públicos de Internet.');
  const en=await POST(apiRequest('en',undefined,'es-PE'));
  assert.equal((await en.json()).error,'We can only analyze public websites.');
});
test('saved Spanish preference overrides an English browser in API',async()=>{
  const response=await POST(apiRequest(undefined,'es','en-US'));
  assert.equal((await response.json()).error,'Solo podemos analizar sitios públicos de Internet.');
});
test('custom production domains are accepted behind a trusted forwarded host',()=>{
 const request=new Request('https://can-ai-read.vercel.app/api/analyze',{headers:{Origin:'https://canaireadyou.com','x-forwarded-host':'canaireadyou.com'}});
 assert.equal(isAllowedRequestOrigin(request),true);
});
test('an unrelated browser origin remains rejected behind the proxy',()=>{
 const request=new Request('https://can-ai-read.vercel.app/api/analyze',{headers:{Origin:'https://attacker.example','x-forwarded-host':'canaireadyou.com'}});
 assert.equal(isAllowedRequestOrigin(request),false);
});
