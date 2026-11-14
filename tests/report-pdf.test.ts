import assert from 'node:assert/strict';
import test from 'node:test';
import zlib from 'node:zlib';
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
