import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyze} from '../src/lib/analyze';
import type {safeFetch} from '../src/lib/safe-fetch';
import {createDemoReport} from '../src/lib/demo-report';
import {POST as screenshot} from '../src/pages/api/screenshot';
const healthy=`<!doctype html>
<html><head>
<title>Pet supplies in Lima</title>
<meta name="description" content="Pet food and supplies in Lima.">
<link rel="canonical" href="https://github.com/shop">
<meta name="generator" content="WordPress 6">
<link rel="stylesheet" href="/wp-content/themes/shop/main.css">
</head><body><main>
<h1>Pet food and supplies in Lima</h1>
<p>${'Useful product information. '.repeat(50)}</p>
<img src="/decoration.svg" alt="">
<a href="/products">Explore products</a>
</main></body></html>`;
function source(html:string,robots='User-agent: *\nAllow: /\nUser-agent: GPTBot\nDisallow: /'):typeof safeFetch{return async url=>({status:200,url,redirects:0,body:url.endsWith('/robots.txt')?robots:html,headers:{'content-type':url.endsWith('/robots.txt')?'text/plain':'text/html'}});}
test('evidence includes actual HTML response lines without inventing private source paths',async()=>{
 const report=await analyze('https://github.com/shop',source(healthy));
 const metadata=report.findings.find(f=>f.id==='metadata')!;
 assert.equal(metadata.evidenceRows.find(e=>e.location==='title')?.line,3);
 assert.equal(report.platform,'wordpress');
 assert.match(metadata.where,/WordPress/);
 assert.match(metadata.where,/not verified/);
 assert.equal(report.resources[0].url,'https://github.com/wp-content/themes/shop/main.css');
 assert.ok(!metadata.where.includes('src/pages/index.astro'));
});
test('optional schema and training opt-outs do not become warnings or priority actions',async()=>{
 const report=await analyze('https://github.com/shop',source(healthy));
 assert.equal(report.overview.highPriority,0);
 assert.equal(report.overview.actions,0);
 assert.equal(report.findings.find(f=>f.id==='schema')?.state,'info');
 assert.equal(report.findings.find(f=>f.id==='schema')?.priority,'none');
 assert.equal(report.agents.find(a=>a.name==='GPTBot')?.state,'blocked');
 assert.equal(report.findings.find(f=>f.id==='images')?.state,'pass');
 assert.equal(report.metrics.missingAlt,0);
});
test('restricted search and noindex become separate high-priority actions',async()=>{
 const report=await analyze('https://github.com/shop',source(healthy.replace('</head>','<meta name="robots" content="noindex"></head>'),'User-agent: OAI-SearchBot\nDisallow: /'));
 assert.equal(report.overview.highPriority,2);
 assert.equal(report.findings.find(f=>f.id==='indexing')?.priority,'high');
 assert.equal(report.findings.find(f=>f.id==='search-access')?.priority,'high');
 assert.match(report.findings.find(f=>f.id==='search-access')!.evidence,/OAI-SearchBot/);
});
test('generic headings and missing alt are review opportunities, not AI guarantees',async()=>{
 const report=await analyze('https://github.com/shop',source(healthy.replace('Pet food and supplies in Lima</h1>','Home</h1>').replace(' alt=""','')));
 assert.equal(report.findings.find(f=>f.id==='headings')?.state,'info');
 assert.equal(report.findings.find(f=>f.id==='images')?.state,'info');
 assert.equal(report.metrics.missingAlt,1);
 assert.match(report.findings.find(f=>f.id==='images')!.impact,/do not inspect image pixels/);
});
test('every finding provides actionable detail in both languages and leaves external text untouched',async()=>{
 for(const locale of ['en','es']as const){
  const report=await analyze('https://github.com/shop',source(healthy),locale);
  assert.equal(report.title,'Pet supplies in Lima');
  for(const finding of report.findings){
   assert.ok(finding.explanation.length>30);
   assert.ok(finding.steps.length>=2);
   assert.ok(finding.where.length>30);
   assert.ok(finding.verification.length>30);
   assert.ok(finding.documentation.startsWith('https://'));
  }
  assert.equal(report.overview.checks,report.findings.length);
 }
});
test('malformed schema carries its source evidence and becomes actionable',async()=>{
 const report=await analyze('https://github.com/shop',source(healthy.replace('</head>','<script type="application/ld+json">{"bad":}</script></head>')));
 const finding=report.findings.find(f=>f.id==='schema')!;
 assert.equal(finding.priority,'medium');
 assert.match(finding.evidenceRows[0].value,/JSON INVALID/);
 assert.match(finding.evidenceRows[0].value,/\{"bad":\}/);
});
test('demo makes its fictional nature explicit and statistics match the actual demo excerpt',()=>{
 for(const locale of ['en','es']as const){const report=createDemoReport(locale);assert.match(report.scope,/fictional|ficticias/);assert.equal(report.words,report.excerpt.split(/\s+/).length);assert.ok(report.findings.length>=10);}
});
function screenshotRequest(body: unknown, origin = 'https://can-ai-read.example') {
 return {request:new Request(`${origin}/api/screenshot`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)})} as Parameters<typeof screenshot>[0];
}
test('desktop screenshot rejects private destinations before launching a browser',async()=>{
 const response=await screenshot(screenshotRequest({url:'http://127.0.0.1'}));
 assert.equal(response.status,422);
});
test('desktop screenshot rejects cross-origin requests',async()=>{
 const context=screenshotRequest({url:'https://github.com'});
 context.request=new Request('https://can-ai-read.example/api/screenshot',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.example'},body:'{"url":"https://github.com"}'});
 const response=await screenshot(context);
 assert.equal(response.status,403);
});
