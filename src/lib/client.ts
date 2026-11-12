import { translator, type Locale } from './i18n';
const locale: Locale = document.documentElement.lang === 'es' ? 'es' : 'en';
const t = translator(locale);
import type { Report } from './diagnostics';
import { renderDiagnostics } from './report-ui';
import { createDemoReport } from './demo-report';
import { resetVisualPreview } from './visual-preview-client';
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
const demoButton = element<HTMLButtonElement>('demo-button');
let current: Report | null = null;
let isDemo = false;
const setText = (id: string, value: string) => { element(id).textContent = value; };
function node(tag: string, className: string, text?: string) { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; }
function tab(name: string) {
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => { const active = button.dataset.tab === name; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; element(`panel-${button.dataset.tab}`).hidden = !active; });
}
function render(data: Report, demo = false) {
  current = data; isDemo = demo;
  empty.hidden = true;
  setText('report-mode', demo ? t("EJEMPLO · DATOS FICTICIOS") : t("DIAGNÓSTICO DE PÁGINA"));
  setText('report-status', data.status === 'limitations' ? t("ACCESIBLE CON LIMITACIONES") : t("HTML ACCESIBLE Y EXTRAÍBLE"));
  element('report-status').classList.toggle('warning', data.status === 'limitations');
  setText('report-title', data.title);
  const url = element<HTMLAnchorElement>('report-url'); url.textContent = data.url; url.href = data.url;
  setText('report-scope', data.scope + (demo ? t(" · Ejemplo ilustrativo; no se ha visitado este dominio.") : ' · ' + new Date(data.analyzedAt).toLocaleString(locale === 'es' ? 'es-PE' : 'en-US')));
  setText('word-count', data.words.toLocaleString(locale === 'es' ? 'es-PE' : 'en-US')); setText('link-count', String(data.internalLinks));
  renderDiagnostics(data,locale,demo);
  resetVisualPreview(data.url,demo,locale);
  const agents = element('agents-list'); agents.replaceChildren();
  data.agents.forEach(a => { const row = node('div','agent-row'); const identity = node('div',''); identity.append(node('strong','',a.name),node('small','',`${a.provider} · ${a.purpose}`)); row.append(identity,node('p','',a.evidence),node('span',`agent-badge ${a.state}`,a.state === 'allowed' ? t("PERMITIDO POR REGLAS") : a.state === 'blocked' ? t("RESTRINGIDO POR REGLAS") : t("NO VERIFICADO"))); agents.append(row); });
  setText('extracted-text',data.excerpt || t("No se pudo extraer texto del contenido principal."));
  tab('findings'); report.hidden = false; report.focus({ preventScroll: true }); report.scrollIntoView({ behavior: 'smooth',block:'start' });
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  error.hidden = true;
  const value = input.value.trim();
  if (!value) { error.textContent = t("Introduce la dirección de una página pública."); error.hidden = false; input.focus(); return; }
  const started = performance.now();
  submit.disabled = true; demoButton.disabled = true; setSubmitLabel(t("Analizando…")); loading.hidden = false; empty.hidden = true; report.hidden = true; form.setAttribute('aria-busy','true'); loading.scrollIntoView({ behavior:'smooth',block:'center' });
  let failure = '';
  const waitForMinimum = async () => { const remaining = 2000 - (performance.now() - started); if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining)); };
  try {
    const response = await fetch('/api/analyze',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:value,language:locale}), signal: AbortSignal.timeout(25_000) });
    const data = await response.json();
    await waitForMinimum();
    if (!response.ok) throw new Error(data.error || t("No pudimos completar el análisis."));
    render(data);
  } catch (e) {
    await waitForMinimum();
    failure = e instanceof Error && e.name === 'TimeoutError' ? t("El análisis tardó demasiado. Vuelve a intentarlo.") : e instanceof Error ? e.message : t("Error de conexión. Vuelve a intentarlo.");
  } finally {
    submit.disabled = false; demoButton.disabled = false; setSubmitLabel(t("Analizar mi web")); loading.hidden = true; form.removeAttribute('aria-busy');
    if (failure) { setText('empty-message', failure); empty.hidden = false; empty.scrollIntoView({ behavior:'smooth', block:'center' }); }
  }
});
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button,index,all) => {
  button.addEventListener('click',()=>tab(button.dataset.tab!));
  button.addEventListener('keydown',event => { let target = index; if(event.key==='ArrowRight')target=(index+1)%all.length; else if(event.key==='ArrowLeft')target=(index+all.length-1)%all.length; else if(event.key==='Home')target=0; else if(event.key==='End')target=all.length-1; else return; event.preventDefault(); all[target].click(); all[target].focus(); });
});
element('download-button').addEventListener('click',()=> { if(!current)return; const blob=new Blob([JSON.stringify({...current,demo:isDemo},null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=`can-ai-read-${isDemo?'example':new URL(current.url).hostname}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); });
demoButton.addEventListener('click',()=>render(createDemoReport(locale),true));

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
