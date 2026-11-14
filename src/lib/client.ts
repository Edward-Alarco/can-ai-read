import { translator, type Locale } from './i18n';
const locale: Locale = document.documentElement.lang === 'es' ? 'es' : 'en';
const t = translator(locale);
import type { Report } from './diagnostics';
import { renderDiagnostics, openTabsGuideDialog } from './report-ui';
const minimumLoadMs = 2000;
const maximumLoadMs = 10000;
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const form = element<HTMLFormElement>('audit-form');
const input = element<HTMLInputElement>('site-url');
const submit = element<HTMLButtonElement>('analyze-button');
const submitIcon = submit.querySelector('img');
function setSubmitLabel(label: string) {
  submit.textContent = label;
  if (submitIcon) submit.append(' ', submitIcon);
}
const error = element('form-error');
const loading = element('loading');
const empty = element('empty-result');
const report = element('report');
let current: Report | null = null;
let isDemo = false;
let screenshotUrl = '';
let screenshotController: AbortController | null = null;
let shotGeneration = 0;
const setText = (id: string, value: string) => { element(id).textContent = value; };
function node(tag: string, className: string, text?: string) { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; }
function tab(name: string) {
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => { const active = button.dataset.tab === name; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; element(`panel-${button.dataset.tab}`).hidden = !active; });
}
function discardScreenshot() {
  shotGeneration += 1;
  screenshotController?.abort();
  screenshotController = null;
  const image = element<HTMLImageElement>('desktop-screenshot');
  image.hidden = true;
  image.removeAttribute('src');
  if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
  screenshotUrl = '';
}
async function requestScreenshot(url: string, signal: AbortSignal) {
  const generation = shotGeneration;
  const image = element<HTMLImageElement>('desktop-screenshot');
  try {
    const response = await fetch('/api/screenshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal,
    });
    if (!response.ok || signal.aborted || generation !== shotGeneration) return false;
    const blob = await response.blob();
    if (signal.aborted || generation !== shotGeneration || !blob.type.startsWith('image/')) return false;
    screenshotUrl = URL.createObjectURL(blob);
    image.src = screenshotUrl;
    return true;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) console.warn('Desktop screenshot unavailable.');
    return false;
  }
}
function showScreenshot() {
  if (!screenshotUrl) return;
  const image = element<HTMLImageElement>('desktop-screenshot');
  image.src = screenshotUrl;
  image.hidden = false;
}
function render(data: Report, demo = false) {
  current = data; isDemo = demo;
  empty.hidden = true;
  setText('report-mode', demo ? t("EJEMPLO · DATOS FICTICIOS") : t("DIAGNÓSTICO DE PÁGINA"));
  setText('report-status', data.status === 'limitations' ? t("ACCESIBLE CON LIMITACIONES") : t("HTML ACCESIBLE Y EXTRAÍBLE"));
  element('report-status').classList.toggle('warning', data.status === 'limitations');
  setText('report-title', data.title);
  const url = element<HTMLAnchorElement>('report-url'); url.textContent = data.url; url.href = data.url;
  renderDiagnostics(data,locale);
  if (demo) discardScreenshot();
  const agents = element('agents-list'); agents.replaceChildren();
  data.agents.forEach(a => { const row = node('div','agent-row'); const identity = node('div',''); identity.append(node('strong','',a.name),node('small','',`${a.provider} · ${a.purpose}`)); row.append(identity,node('p','',a.evidence),node('span',`agent-badge ${a.state}`,a.state === 'allowed' ? t("PERMITIDO POR REGLAS") : a.state === 'blocked' ? t("RESTRINGIDO POR REGLAS") : t("NO VERIFICADO"))); agents.append(row); });
  setText('extracted-text',data.excerpt || t("No se pudo extraer texto del contenido principal."));
  tab('findings'); loading.hidden = true; report.hidden = false; report.focus({ preventScroll: true }); report.scrollIntoView({ behavior: 'smooth',block:'start' });
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  error.hidden = true;
  const value = input.value.trim();
  if (!value) { error.textContent = t("Introduce la dirección de una página pública."); error.hidden = false; input.focus(); return; }
  const started = performance.now();
  submit.disabled = true; setSubmitLabel(t("Analizando…")); loading.hidden = false; empty.hidden = true; report.hidden = true; form.setAttribute('aria-busy','true'); loading.scrollIntoView({ behavior:'smooth',block:'center' });
  const waitUntil = async (limit: number) => { const remaining = limit - (performance.now() - started); if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining)); };
  discardScreenshot();
  const shotController = new AbortController();
  screenshotController = shotController;
  const stopShot = setTimeout(() => shotController.abort(), maximumLoadMs);
  const shotPromise = requestScreenshot(value, shotController.signal);
  let failure = '';
  try {
    const response = await fetch('/api/analyze',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:value,language:locale}), signal: AbortSignal.timeout(maximumLoadMs) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t("No pudimos completar el análisis."));
    const shotReady = await Promise.race([shotPromise, waitUntil(maximumLoadMs).then(() => false)]);
    if (!shotReady) discardScreenshot();
    await waitUntil(minimumLoadMs);
    if (shotReady) showScreenshot();
    render(data);
  } catch (e) {
    discardScreenshot();
    await waitUntil(minimumLoadMs);
    failure = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError') ? t("No pudimos completar el análisis.") : e instanceof Error ? e.message : t("Error de conexión. Vuelve a intentarlo.");
  } finally {
    clearTimeout(stopShot);
    submit.disabled = false; setSubmitLabel(t("Analizar mi web")); loading.hidden = true; form.removeAttribute('aria-busy');
    if (failure) { setText('empty-message', failure); empty.hidden = false; empty.scrollIntoView({ behavior:'smooth', block:'center' }); }
  }
});
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button,index,all) => {
  button.addEventListener('click',()=>tab(button.dataset.tab!));
  button.addEventListener('keydown',event => { let target = index; if(event.key==='ArrowRight')target=(index+1)%all.length; else if(event.key==='ArrowLeft')target=(index+all.length-1)%all.length; else if(event.key==='Home')target=0; else if(event.key==='End')target=all.length-1; else return; event.preventDefault(); all[target].click(); all[target].focus(); });
});
element<HTMLButtonElement>('tabs-guide-button').addEventListener('click',event=>{
  const opener=event.currentTarget as HTMLButtonElement;
  openTabsGuideDialog(locale,opener);
});
element('download-button').addEventListener('click', async () => {
  if (!current) return;
  const button = element<HTMLButtonElement>('download-button');
  if (button.disabled) return;
  const label = button.textContent || '';
  button.disabled = true;
  button.textContent = t("Generando reporte…");
  try {
    const { downloadReportPdf } = await import('./report-pdf');
    await downloadReportPdf(current, { locale, isDemo, screenshotDataUrl: screenshotUrl || null });
  } catch (error) {
    console.error('Could not generate the report PDF.', error);
    button.textContent = t("No se pudo generar el PDF. Vuelve a intentarlo.");
    await new Promise(resolve => setTimeout(resolve, 2500));
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = label;
    }
  }
});
document.querySelectorAll<HTMLDetailsElement>('.faq-list details').forEach(detail => {
  detail.querySelector('summary')?.addEventListener('click', event => {
    if (detail.open) event.preventDefault();
  });
});

// Only an explicit user choice is saved; automatic detection is re-evaluated on a later visit.
document.querySelectorAll<HTMLButtonElement>('[data-language]').forEach(button => {
  button.addEventListener('click', () => {
    const language = button.dataset.language;
    if (language !== 'en' && language !== 'es') return;
    document.cookie = `language=${language}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    location.reload();
  });
});
