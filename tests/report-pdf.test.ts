import assert from 'node:assert/strict';
import test from 'node:test';
import zlib from 'node:zlib';
import fs from 'node:fs';
import type { Report } from '../src/lib/diagnostics';
import { createDemoReport } from '../src/lib/demo-report';
import { buildReportPdf, reportPdfFilename, toPdfText } from '../src/lib/report-pdf';

test('Spanish punctuation and accented characters are kept for the PDF font', () => {
  assert.equal(toPdfText('áéíóúñ¿¡ ÁÉÍÓÚÑ'), 'áéíóúñ¿¡ ÁÉÍÓÚÑ');
  assert.equal(toPdfText('«Diagnóstico — can ai read you.»'), '«Diagnóstico — can ai read you.»');
});

test('the report filename uses the host and the local date', () => {
  const report = createDemoReport('es');
  const date = new Date(2026, 10, 14);
  assert.equal(reportPdfFilename(report, false, date), 'canaireadyou-estudio.example-2026-11-14.pdf');
  assert.equal(reportPdfFilename(report, true, date), 'canaireadyou-example-2026-11-14.pdf');
});

test('a Spanish demo report PDF contains the score, findings, crawlers and reading view', async () => {
  const report = createDemoReport('es');
  const doc = await buildReportPdf(report, { locale: 'es', isDemo: true, generatedAt: new Date(2026, 10, 14, 10, 0, 0) });
  const raw = Buffer.from(doc.output('arraybuffer'));
  assert.equal(raw.subarray(0, 5).toString(), '%PDF-');
  assert.ok(doc.getNumberOfPages() >= 2, `expected at least 2 pages, got ${doc.getNumberOfPages()}`);
  const text = pdfText(raw);
  assert.match(text, /EJEMPLO/);
  assert.match(text, /DATOS FICTICIOS/);
  assert.match(text, /estudio\.example/);
  assert.match(text, new RegExp(String(report.score.score)));
  assert.match(text, /Acceso/);
  assert.match(text, /Contenido/);
  assert.match(text, /Señales/);
  assert.match(text, /Diagnóstico/);
  assert.match(text, /Rastreadores/);
  assert.match(text, /Vista de lectura/);
  assert.match(text, /Diseño/);
  assert.match(text, /can ai read you/);
  assert.match(text, /GPTBot/);
  assert.match(text, /Recomendación/);
  assert.match(text, /1 encabezado H1 detectado/);
  assert.doesNotMatch(text, /1 encabezados H1 detectados/);
  assert.match(text, /información|descripción|página/i);
});

test('an English demo report PDF uses English section labels', async () => {
  const report = createDemoReport('en');
  const doc = await buildReportPdf(report, { locale: 'en', isDemo: true });
  const text = pdfText(Buffer.from(doc.output('arraybuffer')));
  assert.match(text, /SAMPLE/);
  assert.match(text, /FICTIONAL DATA/);
  assert.match(text, /Findings/);
  assert.match(text, /Crawlers/);
  assert.match(text, /Reading view/);
  assert.match(text, /Recommendation/);
  assert.match(text, /Access/);
});

test('broken logo and screenshot images fail soft: the PDF is still produced with the text wordmark', async () => {
  const report = createDemoReport('en');
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  try {
    const doc = await buildReportPdf(report, {
      locale: 'en',
      logoDataUrl: 'data:image/png;base64,AAAA',
      screenshotDataUrl: 'data:image/jpeg;base64,/9j/AAAA',
    });
    const raw = Buffer.from(doc.output('arraybuffer'));
    assert.equal(raw.subarray(0, 5).toString(), '%PDF-');
    const text = pdfText(raw);
    assert.match(text, /can ai read you\./);
    assert.match(text, /Findings/);
  } finally {
    console.error = original;
  }
  assert.ok(errors.length >= 1, 'the swallowed image errors should be logged with console.error');
});

test('a real analysis response (example.com) renders to a PDF', async () => {
  const report = JSON.parse(fs.readFileSync(new URL('./fixtures/example-com-report.json', import.meta.url), 'utf8')) as Report;
  for (const locale of ['en', 'es'] as const) {
    const doc = await buildReportPdf(report, { locale });
    const raw = Buffer.from(doc.output('arraybuffer'));
    assert.equal(raw.subarray(0, 5).toString(), '%PDF-');
    assert.match(pdfText(raw), /example\.com/);
  }
});

test('the dev server pre-bundles jspdf so the dynamic import does not hit a stale optimized chunk', () => {
  const config = fs.readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');
  assert.match(config, /optimizeDeps:\s*\{\s*include:\s*\[[^\]]*'jspdf'/);
});

function pdfText(raw: Buffer): string {
  const source = raw.toString('latin1');
  let combined = source;
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of source.matchAll(streamRe)) {
    try {
      combined += '\n' + zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      // The object may not be a deflated content stream.
    }
  }
  const chunks: string[] = [];
  const pattern = /\((?:\\.|[^\\)])*\)/g;
  for (const match of combined.match(pattern) ?? []) {
    const inner = match.slice(1, -1);
    chunks.push(inner
      .replace(/\\(\d{3})/g, (_all, oct: string) => String.fromCharCode(parseInt(oct, 8)))
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\([()\\])/g, '$1'));
  }
  return chunks.join('\n');
}
