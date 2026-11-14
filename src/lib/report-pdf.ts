import { copy, type Finding, type Report } from './diagnostics';
import type { Locale } from './i18n';
import { computeScore, scoreRange, SCORE_RANGES, type PageScore } from './score';
import type { jsPDF } from 'jspdf';

const COLORS = {
  text: [24, 24, 27] as const,
  muted: [82, 82, 91] as const,
  border: [228, 228, 231] as const,
  surface: [250, 250, 250] as const,
  white: [255, 255, 255] as const,
  good: [21, 128, 61] as const,
  mid: [180, 83, 9] as const,
  poor: [185, 28, 28] as const,
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 16;
const MARGIN_TOP = 16;
const MARGIN_BOTTOM = 18;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const WINANSI_EXTRA = new Set([
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022,
  0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178,
]);

const CHAR_REPLACEMENTS: Record<string, string> = {
  '\u00A0': ' ',
  '\u202F': ' ',
  '\u2007': ' ',
  '\u2009': ' ',
  '\u200B': '',
  '\u2011': '-',
  '\u2212': '-',
  '\u2190': '<-',
  '\u2192': '->',
  '\u2191': '^',
  '\u2193': 'v',
  '\u2197': '->',
  '\u21A9': '<-',
};

export type ReportPdfOptions = {
  locale: Locale;
  isDemo?: boolean;
  screenshotDataUrl?: string | null;
  logoDataUrl?: string | null;
  generatedAt?: Date;
};

type RGB = readonly [number, number, number];
type Say = (en: string, es: string) => string;

/** Map text to the WinAnsi repertoire jsPDF's standard fonts can draw. */
export function toPdfText(input: string): string {
  let out = '';
  for (const ch of input.normalize('NFC')) {
    if (ch in CHAR_REPLACEMENTS) {
      out += CHAR_REPLACEMENTS[ch];
      continue;
    }
    const code = ch.codePointAt(0)!;
    if (code === 0x09 || code === 0x0A || code === 0x0D || (code >= 0x20 && code <= 0x7E) || (code >= 0xA0 && code <= 0xFF) || WINANSI_EXTRA.has(code)) {
      out += ch;
    }
  }
  return out;
}

export function reportPdfFilename(report: Report, isDemo = false, date = new Date()): string {
  let host = 'example';
  if (!isDemo) {
    try {
      host = new URL(report.url).hostname || 'example';
    } catch {
      host = 'example';
    }
  }
  const safe = host.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'example';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `canaireadyou-${safe}-${year}-${month}-${day}.pdf`;
}

export async function buildReportPdf(report: Report, options: ReportPdfOptions): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  renderReport(doc, report, options);
  return doc;
}

export async function downloadReportPdf(report: Report, options: ReportPdfOptions): Promise<string> {
  const generatedAt = options.generatedAt ?? new Date();
  // The logo and the screenshot are decorative: if either fails, the PDF is still produced
  // (with the text wordmark and without the screenshot).
  const logoDataUrl = await optionalAsset('logo', () => options.logoDataUrl !== undefined ? Promise.resolve(options.logoDataUrl) : loadLogoDataUrl());
  const screenshotDataUrl = await optionalAsset('screenshot', () => prepareScreenshot(options.screenshotDataUrl));
  let doc: jsPDF;
  try {
    doc = await buildReportPdf(report, { ...options, logoDataUrl, screenshotDataUrl, generatedAt });
  } catch (error) {
    if (!logoDataUrl && !screenshotDataUrl) throw error;
    console.error('[report-pdf] Could not render the PDF with images; retrying without logo and screenshot.', error);
    doc = await buildReportPdf(report, { ...options, logoDataUrl: null, screenshotDataUrl: null, generatedAt });
  }
  const filename = reportPdfFilename(report, options.isDemo, generatedAt);
  doc.save(filename);
  return filename;
}

function renderReport(doc: jsPDF, report: Report, options: ReportPdfOptions) {
  const locale = options.locale;
  const s: Say = (en, es) => copy(locale, en, es);
  const score = report.score ?? computeScore(report.findings);
  const dateLocale = locale === 'es' ? 'es-PE' : 'en-US';
  const analyzed = formatTimestamp(report.analyzedAt, dateLocale);
  let y = MARGIN_TOP;

  const addPage = () => {
    doc.addPage();
    y = MARGIN_TOP;
  };

  const ensure = (height: number) => {
    if (y + height > PAGE_HEIGHT - MARGIN_BOTTOM) addPage();
  };

  const setColor = (color: RGB) => doc.setTextColor(color[0], color[1], color[2]);
  const setFill = (color: RGB) => doc.setFillColor(color[0], color[1], color[2]);
  const setDraw = (color: RGB) => doc.setDrawColor(color[0], color[1], color[2]);

  const write = (text: string, x: number, top: number, width: number, fontSize: number, style: 'normal' | 'bold' = 'normal', color: RGB = COLORS.text, lineHeight = fontSize * 0.4) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(fontSize);
    setColor(color);
    const lines = doc.splitTextToSize(toPdfText(text), width) as string[];
    let cursor = top;
    for (const line of lines) {
      if (cursor + lineHeight > PAGE_HEIGHT - MARGIN_BOTTOM) {
        addPage();
        cursor = y;
      }
      doc.text(line, x, cursor + fontSize * 0.32);
      cursor += lineHeight;
    }
    return cursor;
  };

  const paragraph = (text: string, fontSize = 9.5, style: 'normal' | 'bold' = 'normal', color: RGB = COLORS.text, width = CONTENT_WIDTH, x = MARGIN_X) => {
    const lineHeight = fontSize * 0.42 + 0.4;
    const lines = doc.splitTextToSize(toPdfText(text), width) as string[];
    ensure(Math.min(lines.length, 3) * lineHeight + 1);
    y = write(text, x, y, width, fontSize, style, color, lineHeight);
    y += 1.2;
  };

  const sectionTitle = (title: string) => {
    ensure(14);
    y += 3;
    setDraw(COLORS.border);
    doc.setLineWidth(0.25);
    doc.line(MARGIN_X, y, PAGE_WIDTH - MARGIN_X, y);
    y += 5.5;
    paragraph(title, 13, 'bold', COLORS.text);
    y += 0.5;
  };

  // --- Header ---
  const brandTop = y;
  if (options.logoDataUrl) {
    try {
      const logoSize = imageSize(options.logoDataUrl, 76, 9);
      doc.addImage(options.logoDataUrl, 'PNG', MARGIN_X, y - 1, logoSize.width, logoSize.height, undefined, 'FAST');
    } catch (error) {
      console.error('[report-pdf] Could not embed the logo; using the text wordmark.', error);
      options.logoDataUrl = null;
    }
  }
  if (!options.logoDataUrl) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setColor(COLORS.text);
    doc.text('can ai read you.', MARGIN_X, y + 4);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setColor(COLORS.muted);
  const generatedLabel = `${s('Generated', 'Generado')}: ${formatTimestamp((options.generatedAt ?? new Date()).toISOString(), dateLocale)}`;
  doc.text(toPdfText(generatedLabel), PAGE_WIDTH - MARGIN_X, brandTop + 4, { align: 'right' });
  y = brandTop + 11;

  const eyebrow = options.isDemo ? s('SAMPLE · FICTIONAL DATA', 'EJEMPLO · DATOS FICTICIOS') : s('PAGE DIAGNOSTIC', 'DIAGNÓSTICO DE PÁGINA');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setColor(COLORS.muted);
  doc.text(toPdfText(eyebrow), MARGIN_X, y);
  y += 6;

  paragraph(report.title || hostOf(report.url), 16, 'bold', COLORS.text);
  y -= 0.4;
  paragraph(report.url, 9, 'normal', COLORS.muted);
  paragraph(`${s('Analyzed', 'Analizado')}: ${analyzed}`, 8.5, 'normal', COLORS.muted);
  if (options.isDemo) {
    paragraph(s('This is an illustrative demo. The URL, metrics and findings are fictional; no website was visited.', 'Esta es una demo ilustrativa. La URL, las métricas y los hallazgos son ficticios; no se visitó ningún sitio.'), 8.5, 'normal', COLORS.muted);
  }

  // --- Score ---
  sectionTitle(s('AI readability score', 'Puntuación de legibilidad para IA'));
  const range = scoreRange(score.score);
  const rangeColor = range === 'good' ? COLORS.good : range === 'mid' ? COLORS.mid : COLORS.poor;
  const boxHeight = 34;
  ensure(boxHeight + 4);
  setFill(COLORS.surface);
  setDraw(COLORS.border);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, boxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  setColor(rangeColor);
  const scoreLabel = String(score.score);
  const scoreWidth = doc.getTextWidth(scoreLabel);
  doc.text(scoreLabel, MARGIN_X + 8, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setColor(COLORS.muted);
  doc.text('/100', MARGIN_X + 8 + scoreWidth + 1.5, y + 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setColor(rangeColor);
  doc.text(toPdfText(rangeLabel(range, s)), MARGIN_X + 8, y + 25.5);

  const scoreCopyX = MARGIN_X + 48;
  const scoreCopyWidth = CONTENT_WIDTH - 56;
  let copyY = y + 8;
  copyY = write(verdictText(score, report, s), scoreCopyX, copyY, scoreCopyWidth, 10, 'bold', COLORS.text, 5);
  copyY += 1;
  copyY = write(scoreExplanation(range, s), scoreCopyX, copyY, scoreCopyWidth, 8.5, 'normal', COLORS.muted, 4.2);
  if (score.cap) {
    copyY += 0.8;
    write(capText(score, s), scoreCopyX, copyY, scoreCopyWidth, 8, 'normal', COLORS.poor, 4);
  }
  y += boxHeight + 5;

  ensure(18);
  const groupWidth = (CONTENT_WIDTH - 8) / 3;
  score.groups.forEach((group, index) => {
    const x = MARGIN_X + index * (groupWidth + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setColor(COLORS.muted);
    doc.text(toPdfText(groupLabel(group.id, s)), x, y + 3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setColor(COLORS.text);
    doc.text(`${group.points}/${group.max}`, x + groupWidth, y + 3, { align: 'right' });
    setFill(COLORS.border);
    doc.roundedRect(x, y + 6, groupWidth, 2.2, 0.8, 0.8, 'F');
    const ratio = group.max ? Math.max(0, Math.min(1, group.points / group.max)) : 0;
    if (ratio > 0) {
      setFill(COLORS.text);
      doc.roundedRect(x, y + 6, Math.max(2, groupWidth * ratio), 2.2, 0.8, 0.8, 'F');
    }
  });
  y += 14;

  paragraph(s(
    'The score measures observable technical readability: whether the page can be reached, whether the important text is in the initial HTML, and whether the page clearly describes itself. It does not predict whether an AI will understand, index or cite the page.',
    'La nota mide la legibilidad técnica observable: si se puede acceder a la página, si el texto importante está en el HTML inicial y si la página se describe con claridad. No predice si una inteligencia artificial entenderá, indexará o citará la página.',
  ), 8.5, 'normal', COLORS.muted);

  // --- Screenshot ---
  if (options.screenshotDataUrl) {
    try {
      const maxWidth = CONTENT_WIDTH;
      const maxHeight = 72;
      const size = imageSize(options.screenshotDataUrl, maxWidth, maxHeight);
      ensure(size.height + 8);
      setDraw(COLORS.border);
      doc.setLineWidth(0.3);
      doc.roundedRect(MARGIN_X, y, size.width, size.height, 1.2, 1.2, 'S');
      doc.addImage(options.screenshotDataUrl, detectImageFormat(options.screenshotDataUrl), MARGIN_X, y, size.width, size.height, undefined, 'FAST');
      y += size.height + 3;
      paragraph(s('Desktop screenshot of the analyzed page, for visual reference only.', 'Captura de escritorio de la página analizada, solo como referencia visual.'), 8, 'normal', COLORS.muted);
    } catch (error) {
      // A broken screenshot should not block the rest of the report.
      console.error('[report-pdf] Could not embed the screenshot; skipping it.', error);
    }
  }

  // --- Findings ---
  sectionTitle(s('Findings', 'Diagnóstico'));
  paragraph(s(
    `${report.overview.checks} checks performed · ${report.overview.passed} passed · ${report.overview.actions} recommended actions · ${report.overview.highPriority} high priority.`,
    `${report.overview.checks} comprobaciones realizadas · ${report.overview.passed} correctas · ${report.overview.actions} acciones recomendadas · ${report.overview.highPriority} de prioridad alta.`,
  ), 8.5, 'normal', COLORS.muted);

  const priorityOrder = { high: 0, medium: 1, low: 2, none: 3 };
  const findings = [...report.findings].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || (a.state === 'pass' ? 1 : 0) - (b.state === 'pass' ? 1 : 0));
  const deductedById = new Map(score.perFinding.map(item => [item.id, item.deducted]));

  findings.forEach((finding) => {
    renderFinding(doc, finding, s, deductedById.get(finding.id) ?? 0, { ensure, addPage, paragraph, yRef: () => y, setY: value => { y = value; }, setColor, setFill, setDraw });
  });

  // --- Crawlers ---
  sectionTitle(s('Crawlers', 'Rastreadores'));
  paragraph(s(
    'These are the declared robots.txt rules for the analyzed path. They do not prove that a provider has visited your website. Restricting training crawlers is your choice and does not lower the score.',
    'Estas son las reglas declaradas en robots.txt para la ruta analizada. No prueban que un proveedor haya visitado tu web. Restringir los rastreadores de entrenamiento es una decisión tuya y no baja la nota.',
  ), 8.5, 'normal', COLORS.muted);

  renderAgentsTable(doc, report, s, { ensure, addPage, yRef: () => y, setY: value => { y = value; }, setColor, setFill, setDraw });

  // --- Reading view ---
  sectionTitle(s('Reading view', 'Vista de lectura'));
  paragraph(s(
    'This is the text extracted from the initial HTML, without running JavaScript. If important information is missing here, a machine may not be able to read it either.',
    'Este es el texto extraído del HTML inicial, sin ejecutar JavaScript. Si aquí falta información importante, es probable que una máquina tampoco pueda leerla.',
  ), 8.5, 'normal', COLORS.muted);

  paragraph(`${s('Title', 'Título')}: ${report.title || s('No title detected', 'No se detectó un título')}`, 9.5, 'bold');
  paragraph(s(
    `${counted(report.words, dateLocale, 'word extracted', 'words extracted')} · ${counted(report.internalLinks, dateLocale, 'internal link', 'internal links')} · ${counted(report.metrics.headings, dateLocale, 'heading', 'headings')}.`,
    `${counted(report.words, dateLocale, 'palabra extraída', 'palabras extraídas')} · ${counted(report.internalLinks, dateLocale, 'enlace interno', 'enlaces internos')} · ${counted(report.metrics.headings, dateLocale, 'encabezado', 'encabezados')}.`,
  ), 8.5, 'normal', COLORS.muted);

  const excerpt = (report.excerpt || s('No main text could be extracted from the page.', 'No se pudo extraer texto del contenido principal.')).trim();
  const excerptLimit = 1800;
  const clipped = excerpt.length > excerptLimit;
  paragraph(clipped ? `${excerpt.slice(0, excerptLimit).trimEnd()}…` : excerpt, 9, 'normal', COLORS.text);
  if (clipped) {
    paragraph(s('The excerpt is shortened in this PDF. The full extracted text is available in the on-screen reading view.', 'El extracto se acorta en este PDF. El texto completo está en la vista de lectura de la web.'), 8, 'normal', COLORS.muted);
  }

  paragraph(s(
    'A technical check does not guarantee indexing, rankings or mentions in AI answers.',
    'Una comprobación técnica no garantiza indexación, posiciones ni menciones en respuestas de IA.',
  ), 8, 'normal', COLORS.muted);

  // --- Footer on every page ---
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    setDraw(COLORS.border);
    doc.setLineWidth(0.25);
    doc.line(MARGIN_X, PAGE_HEIGHT - 12, PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setColor(COLORS.muted);
    doc.text('can ai read you.', MARGIN_X, PAGE_HEIGHT - 7.5);
    const host = hostOf(report.url);
    doc.text(toPdfText(host), PAGE_WIDTH / 2, PAGE_HEIGHT - 7.5, { align: 'center' });
    doc.text(`${page} / ${pageCount}`, PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 7.5, { align: 'right' });
  }
}

function renderFinding(
  doc: jsPDF,
  finding: Finding,
  s: Say,
  deducted: number,
  ctx: {
    ensure: (height: number) => void;
    addPage: () => void;
    paragraph: (text: string, fontSize?: number, style?: 'normal' | 'bold', color?: RGB, width?: number, x?: number) => void;
    yRef: () => number;
    setY: (value: number) => void;
    setColor: (color: RGB) => void;
    setFill: (color: RGB) => void;
    setDraw: (color: RGB) => void;
  },
) {
  ctx.ensure(22);
  let y = ctx.yRef();
  const status = statusLabel(finding, s);
  const statusColor = finding.state === 'pass' ? COLORS.good : finding.state === 'warning' ? COLORS.mid : COLORS.muted;
  const badges = [status];
  if (finding.priority !== 'none') badges.push(priorityLabel(finding.priority, s));
  if (deducted > 0) badges.push(`-${deducted}`);

  ctx.setFill(COLORS.surface);
  ctx.setDraw(COLORS.border);
  doc.setLineWidth(0.3);
  // Draw a short header bar; the body flows after it and may paginate.
  const headerHeight = 8;
  doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, headerHeight, 1, 1, 'FD');
  ctx.setFill(statusColor);
  doc.rect(MARGIN_X, y + 1.4, 1.2, headerHeight - 2.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  ctx.setColor(COLORS.text);
  const titleWidth = CONTENT_WIDTH - 62;
  const title = toPdfText(finding.userTitle);
  doc.text(doc.splitTextToSize(title, titleWidth)[0] as string, MARGIN_X + 5, y + 5.3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  ctx.setColor(statusColor);
  doc.text(toPdfText(badges.join('  ·  ')), PAGE_WIDTH - MARGIN_X - 3, y + 5.3, { align: 'right' });
  ctx.setY(y + headerHeight + 3.5);

  ctx.paragraph(finding.action, 9, 'normal', COLORS.text);
  writeBlock(s('What we found', 'Qué encontramos'), finding.evidence, ctx);
  writeBlock(s('What it means', 'Qué significa'), finding.explanation, ctx);
  const recommendation = (finding.steps.length ? finding.steps : [finding.action]).filter(Boolean).join('\n');
  writeBlock(s('Recommendation', 'Recomendación'), recommendation, ctx);
  ctx.setY(ctx.yRef() + 2);
}

function writeBlock(
  heading: string,
  body: string,
  ctx: { paragraph: (text: string, fontSize?: number, style?: 'normal' | 'bold', color?: RGB, width?: number, x?: number) => void; ensure: (height: number) => void },
) {
  const text = (body || '').trim();
  if (!text) return;
  ctx.ensure(16);
  ctx.paragraph(heading, 8, 'bold', COLORS.muted);
  ctx.paragraph(text, 9, 'normal', COLORS.text);
}

function renderAgentsTable(
  doc: jsPDF,
  report: Report,
  s: Say,
  ctx: {
    ensure: (height: number) => void;
    addPage: () => void;
    yRef: () => number;
    setY: (value: number) => void;
    setColor: (color: RGB) => void;
    setFill: (color: RGB) => void;
    setDraw: (color: RGB) => void;
  },
) {
  const columns = [
    { key: 'name', width: 38, label: s('Crawler', 'Rastreador') },
    { key: 'purpose', width: 32, label: s('Type', 'Tipo') },
    { key: 'state', width: 48, label: s('Status', 'Estado') },
    { key: 'evidence', width: CONTENT_WIDTH - 38 - 32 - 48, label: s('Rule found', 'Regla encontrada') },
  ];

  const drawHead = (y: number) => {
    ctx.setFill(COLORS.surface);
    ctx.setDraw(COLORS.border);
    doc.setLineWidth(0.25);
    doc.rect(MARGIN_X, y, CONTENT_WIDTH, 7, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    ctx.setColor(COLORS.muted);
    let x = MARGIN_X + 2;
    for (const column of columns) {
      doc.text(toPdfText(column.label), x, y + 4.7);
      x += column.width;
    }
    return y + 7;
  };

  ctx.ensure(20);
  let y = drawHead(ctx.yRef());

  for (const agent of report.agents) {
    const row = [
      `${agent.name}\n${agent.provider}`,
      agent.purpose,
      agentStateLabel(agent.state, s),
      agent.evidence || '—',
    ];
    const heights = row.map((value, index) => {
      const lines = doc.splitTextToSize(toPdfText(value), columns[index].width - 3) as string[];
      return Math.max(8, lines.length * 3.8 + 3);
    });
    const rowHeight = Math.max(...heights);
    if (y + rowHeight > PAGE_HEIGHT - MARGIN_BOTTOM) {
      ctx.addPage();
      y = drawHead(MARGIN_TOP);
    }
    ctx.setDraw(COLORS.border);
    doc.setLineWidth(0.25);
    doc.rect(MARGIN_X, y, CONTENT_WIDTH, rowHeight, 'S');
    let x = MARGIN_X + 2;
    row.forEach((value, index) => {
      doc.setFont('helvetica', index === 0 ? 'bold' : 'normal');
      doc.setFontSize(index === 0 ? 8.5 : 8);
      ctx.setColor(index === 2 ? agentStateColor(agent.state) : COLORS.text);
      const lines = doc.splitTextToSize(toPdfText(value), columns[index].width - 3) as string[];
      lines.forEach((line, lineIndex) => {
        doc.text(line, x, y + 4.4 + lineIndex * 3.8);
      });
      x += columns[index].width;
    });
    y += rowHeight;
  }
  ctx.setY(y + 3);
}

function statusLabel(finding: Finding, s: Say): string {
  if (finding.state === 'pass') return s('Passed', 'Correcto');
  if (finding.state === 'warning') return s('Review', 'Revisar');
  return s('Information', 'Información');
}

function priorityLabel(priority: Finding['priority'], s: Say): string {
  if (priority === 'high') return s('High priority', 'Prioridad alta');
  if (priority === 'medium') return s('Medium priority', 'Prioridad media');
  if (priority === 'low') return s('Low priority', 'Prioridad baja');
  return '';
}

function agentStateLabel(state: string, s: Say): string {
  if (state === 'allowed') return s('Allowed by the site’s rules', 'Permitido por las reglas del sitio');
  if (state === 'blocked') return s('Restricted by the site’s rules', 'Restringido por las reglas del sitio');
  return s('Could not be verified', 'No se pudo verificar');
}

function agentStateColor(state: string): RGB {
  if (state === 'allowed') return COLORS.good;
  if (state === 'blocked') return COLORS.mid;
  return COLORS.muted;
}

function groupLabel(id: PageScore['groups'][number]['id'], s: Say): string {
  if (id === 'access') return s('Access', 'Acceso');
  if (id === 'content') return s('Content', 'Contenido');
  return s('Signals', 'Señales');
}

function rangeLabel(range: 'good' | 'mid' | 'poor', s: Say): string {
  if (range === 'good') return s(`${SCORE_RANGES.good}–100 · Easy to read`, `${SCORE_RANGES.good}–100 · Se lee con facilidad`);
  if (range === 'mid') return s(`${SCORE_RANGES.mid}–${SCORE_RANGES.good - 1} · Needs improvements`, `${SCORE_RANGES.mid}–${SCORE_RANGES.good - 1} · Conviene mejorar`);
  return s(`Below ${SCORE_RANGES.mid} · Significant obstacles`, `Menos de ${SCORE_RANGES.mid} · Obstáculos importantes`);
}

function scoreExplanation(range: 'good' | 'mid' | 'poor', s: Say): string {
  if (range === 'good') return s(
    'From what we can observe, the page is easy to read. There may be small improvements, but we did not see serious barriers.',
    'En lo que podemos observar, la página se puede leer con facilidad. Puede haber mejoras menores, pero no vimos barreras graves.',
  );
  if (range === 'mid') return s(
    'The page is reachable, but there are specific issues worth fixing so it can be read more clearly.',
    'La página es accesible, aunque hay cosas concretas que conviene corregir para que se lea mejor.',
  );
  return s(
    'We found significant obstacles, or a problem that limits the score. Start with the high-priority findings.',
    'Encontramos obstáculos importantes, o un problema que limita la nota. Empieza por los hallazgos de prioridad alta.',
  );
}

function verdictText(score: PageScore, data: Report, s: Say): string {
  if (score.cap?.reason === 'unreachable') return s('Unreachable: the page could not be retrieved', 'Inaccesible: no pudimos obtener la página');
  if (score.cap?.reason === 'noindex') return s('Blocked: noindex detected', 'Bloqueado: noindex detectado');
  if (score.cap?.reason === 'search-blocked') return s('Blocked: search crawlers restricted', 'Bloqueado: rastreadores de búsqueda restringidos');
  if (score.cap?.reason === 'thin-content') return s('Limited: very little initial HTML text', 'Limitado: muy poco texto en el HTML inicial');
  if (!data.overview.actions) return s('Accessible, no priority actions identified', 'Accesible, sin acciones prioritarias');
  return data.overview.actions === 1
    ? s('Accessible, 1 improvement recommended', 'Accesible, 1 mejora recomendada')
    : s(`Accessible, ${data.overview.actions} improvements recommended`, `Accesible, ${data.overview.actions} mejoras recomendadas`);
}

function capText(score: PageScore, s: Say): string {
  const max = score.cap?.max ?? 0;
  if (score.cap?.reason === 'unreachable') return s(`A retrieval failure caps this score at ${max}.`, `Al no poder obtener la página, la nota no pasa de ${max}.`);
  return s(`A serious issue caps this score at ${max}.`, `Un problema serio hace que la nota no pase de ${max}.`);
}

function counted(n: number, dateLocale: string, one: string, many: string): string {
  return `${n.toLocaleString(dateLocale)} ${n === 1 ? one : many}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatTimestamp(iso: string, dateLocale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(dateLocale, { dateStyle: 'long', timeStyle: 'short' });
}

function detectImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
}

function imageSize(dataUrl: string, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const packed = dataUrlDimensions(dataUrl);
  if (!packed) return { width: maxWidth, height: Math.min(maxHeight, maxWidth * 0.35) };
  const ratio = Math.min(maxWidth / packed.width, maxHeight / packed.height, 1);
  return { width: Math.max(1, packed.width * ratio), height: Math.max(1, packed.height * ratio) };
}

function dataUrlDimensions(dataUrl: string): { width: number; height: number } | null {
  try {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    const binary = atob(dataUrl.slice(comma + 1, comma + 1 + 64_000));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (dataUrl.includes('image/png')) {
      const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
      const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg')) {
      return jpegDimensions(bytes);
    }
  } catch {
    return null;
  }
  return null;
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xFF) break;
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker >= 0xC0 && marker <= 0xC3) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += 2 + length;
  }
  return null;
}

async function optionalAsset(name: string, load: () => Promise<string | null | undefined>): Promise<string | null> {
  try {
    const value = await load();
    return typeof value === 'string' && value.startsWith('data:image/') ? value : null;
  } catch (error) {
    console.error(`[report-pdf] Could not prepare the ${name}; continuing without it.`, error);
    return null;
  }
}

async function prepareScreenshot(source: string | null | undefined): Promise<string | null> {
  if (!source) return null;
  if (source.startsWith('data:')) return source;
  return rasterizeSource(source, 'image/jpeg', 0.72, 1400);
}

async function loadLogoDataUrl(): Promise<string | null> {
  return rasterizeSource('/icons/logo.svg', 'image/png', 1, 1600);
}

async function rasterizeSource(src: string, type: 'image/png' | 'image/jpeg', quality: number, maxWidth: number): Promise<string | null> {
  if (typeof document === 'undefined' || !src) return null;
  try {
    const image = await loadHtmlImage(src);
    const naturalWidth = image.naturalWidth || 445;
    const naturalHeight = image.naturalHeight || 50;
    const scale = naturalWidth > maxWidth ? maxWidth / naturalWidth : (src.endsWith('.svg') || src.includes('svg') ? 4 : 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    if (type === 'image/jpeg') {
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', quality) : canvas.toDataURL('image/png');
  } catch (error) {
    console.error(`[report-pdf] Could not rasterize ${src.startsWith('blob:') ? 'the screenshot' : src}.`, error);
    return null;
  }
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image'));
    image.src = src;
  });
}
