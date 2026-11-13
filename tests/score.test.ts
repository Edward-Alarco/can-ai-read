import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore, recoverablePoints, SCORE_WEIGHTS, SCORE_CAPS } from '../src/lib/score';
import { analyze } from '../src/lib/analyze';
import type { safeFetch } from '../src/lib/safe-fetch';
import { createDemoReport } from '../src/lib/demo-report';

type Check = { id: string; state: 'pass' | 'warning' | 'info'; priority: 'high' | 'medium' | 'low' | 'none' };

const check = (id: string, state: Check['state'] = 'pass', priority: Check['priority'] = 'none'): Check => ({ id, state, priority });

function perfectPage(): Check[] {
  return [
    check('server'),
    check('indexing'),
    check('search-access'),
    check('text'),
    check('headings'),
    check('links'),
    check('images'),
    check('metadata'),
    check('canonical'),
    check('schema', 'info'),
  ];
}

const healthy = `<!doctype html>
<html><head>
<title>Pet supplies in Lima</title>
<meta name="description" content="Pet food and supplies in Lima.">
<link rel="canonical" href="https://github.com/shop">
</head><body><main>
<h1>Pet food and supplies in Lima</h1>
<p>${'Useful product information. '.repeat(50)}</p>
<img src="/decoration.svg" alt="">
<a href="/products">Explore products</a>
</main></body></html>`;

function source(html: string, robots = 'User-agent: *\nAllow: /\nUser-agent: GPTBot\nDisallow: /'): typeof safeFetch {
  return async url => ({
    status: 200,
    url,
    redirects: 0,
    body: url.endsWith('/robots.txt') ? robots : html,
    headers: { 'content-type': url.endsWith('/robots.txt') ? 'text/plain' : 'text/html' },
  });
}

test('a perfect page scores 100', () => {
  const result = computeScore(perfectPage());
  assert.equal(result.score, 100);
  assert.equal(result.uncapped, 100);
  assert.equal(result.cap, undefined);
  assert.deepEqual(result.groups, [
    { id: 'access', points: 40, max: 40 },
    { id: 'content', points: 35, max: 35 },
    { id: 'signals', points: 25, max: 25 },
  ]);
  assert.equal(result.perFinding.reduce((sum, item) => sum + item.weight, 0), 100);
});

test('warnings deduct by priority and informational checks do not', () => {
  const findings = perfectPage().map(item => {
    if (item.id === 'metadata') return check('metadata', 'warning', 'low');
    if (item.id === 'schema') return check('schema', 'warning', 'medium');
    if (item.id === 'headings') return check('headings', 'info', 'low');
    if (item.id === 'links') return check('links', 'info', 'low');
    if (item.id === 'images') return check('images', 'info', 'low');
    return item;
  });
  const result = computeScore(findings);
  const metadata = result.perFinding.find(item => item.id === 'metadata')!;
  const schema = result.perFinding.find(item => item.id === 'schema')!;
  const headings = result.perFinding.find(item => item.id === 'headings')!;
  assert.equal(metadata.awarded, 9);
  assert.equal(metadata.deducted, 3);
  assert.equal(schema.awarded, 4);
  assert.equal(schema.deducted, 3);
  assert.equal(headings.deducted, 0);
  assert.equal(headings.awarded, SCORE_WEIGHTS.content.checks.headings);
  assert.equal(result.score, 94);
  assert.equal(result.cap, undefined);
});

test('blocking training crawlers does not reduce the score', async () => {
  const report = await analyze('https://github.com/shop', source(healthy));
  assert.equal(report.agents.find(agent => agent.name === 'GPTBot')?.state, 'blocked');
  assert.equal(report.findings.find(finding => finding.id === 'search-access')?.state, 'pass');
  assert.equal(report.score.score, 100);
  assert.equal(report.score.cap, undefined);
});

test('noindex caps the score at 40 even when other checks pass', () => {
  const findings = perfectPage().map(item => item.id === 'indexing' ? check('indexing', 'warning', 'high') : item);
  const result = computeScore(findings);
  assert.equal(result.uncapped, 100 - SCORE_WEIGHTS.access.checks.indexing);
  assert.equal(result.cap?.reason, 'noindex');
  assert.equal(result.cap?.max, SCORE_CAPS.noindex);
  assert.equal(result.score, 40);
  assert.ok(recoverablePoints(findings, 'indexing') >= 60);
});

test('an unreachable page is capped at 20 and scores 0 without other evidence', () => {
  const findings = [check('server', 'warning', 'high')];
  const result = computeScore(findings);
  assert.equal(result.cap?.reason, 'unreachable');
  assert.equal(result.cap?.max, SCORE_CAPS.unreachable);
  assert.equal(result.score, 0);
  assert.ok(result.score <= 20);
});

test('near-empty initial HTML caps the score at 40', () => {
  const findings = perfectPage().map(item => item.id === 'text' ? check('text', 'warning', 'medium') : item);
  const result = computeScore(findings);
  assert.equal(result.perFinding.find(item => item.id === 'text')?.awarded, 8);
  assert.equal(result.uncapped, 92);
  assert.equal(result.cap?.reason, 'thin-content');
  assert.equal(result.score, 40);
});

test('the demo report includes a transparent numeric score', () => {
  const report = createDemoReport('en');
  assert.ok(report.score);
  assert.equal(typeof report.score.score, 'number');
  assert.ok(report.score.score >= 0 && report.score.score <= 100);
  assert.equal(report.score.perFinding.find(item => item.id === 'metadata')?.deducted, 3);
  assert.equal(report.score.score, 97);
});
