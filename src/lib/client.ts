import { translator, type Locale } from './i18n';
const locale: Locale = document.documentElement.lang === 'es' ? 'es' : 'en';
const t = translator(locale);
import type { analyze } from './analyze';
type Report = Awaited<ReturnType<typeof analyze>>;
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
  setText('report-mode', demo ? t("EJEMPLO · DATOS FICTICIOS") : t("DIAGNÓSTICO DE PÁGINA"));
  setText('report-status', data.status === 'limitations' ? t("ACCESIBLE CON LIMITACIONES") : t("HTML ACCESIBLE Y EXTRAÍBLE"));
  element('report-status').classList.toggle('warning', data.status === 'limitations');
  setText('report-title', data.title);
  const url = element<HTMLAnchorElement>('report-url'); url.textContent = data.url; url.href = data.url;
  setText('report-scope', data.scope + (demo ? t(" · Ejemplo ilustrativo; no se ha visitado este dominio.") : ' · ' + new Date(data.analyzedAt).toLocaleString(locale === 'es' ? 'es-PE' : 'en-US')));
  setText('word-count', data.words.toLocaleString(locale === 'es' ? 'es-PE' : 'en-US')); setText('link-count', String(data.internalLinks));
  const findings = element('findings-list'); findings.replaceChildren();
  data.findings.forEach(f => { const row = node('article','finding'); const body = node('div',''); body.append(node('h3','',f.title),node('p','',f.evidence),node('p','finding-action',f.action)); const icon = document.createElement('img'); icon.className = `finding-state ${f.state}`; icon.src = f.state === 'pass' ? '/checkcircle.svg' : f.state === 'warning' ? '/warningcircle.svg' : '/infocircle.svg'; icon.alt = ''; icon.width = 32; icon.height = 32; row.append(icon, body); findings.append(row); });
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
  submit.disabled = true; demoButton.disabled = true; setSubmitLabel(t("Analizando…")); loading.hidden = false; report.hidden = true; form.setAttribute('aria-busy','true'); loading.scrollIntoView({ behavior:'smooth',block:'center' });
  try {
    const response = await fetch('/api/analyze',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:value,language:locale}), signal: AbortSignal.timeout(25_000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t("No pudimos completar el análisis."));
    render(data);
  } catch (e) { error.textContent = e instanceof Error && e.name === 'TimeoutError' ? t("El análisis tardó demasiado. Vuelve a intentarlo.") : e instanceof Error ? e.message : t("Error de conexión. Vuelve a intentarlo."); error.hidden = false; input.focus(); }
  finally { submit.disabled = false; demoButton.disabled = false; setSubmitLabel(t("Analizar mi web")); loading.hidden = true; form.removeAttribute('aria-busy'); }
});
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button,index,all) => {
  button.addEventListener('click',()=>tab(button.dataset.tab!));
  button.addEventListener('keydown',event => { let target = index; if(event.key==='ArrowRight')target=(index+1)%all.length; else if(event.key==='ArrowLeft')target=(index+all.length-1)%all.length; else if(event.key==='Home')target=0; else if(event.key==='End')target=all.length-1; else return; event.preventDefault(); all[target].click(); all[target].focus(); });
});
element('download-button').addEventListener('click',()=> { if(!current)return; const blob=new Blob([JSON.stringify({...current,demo:isDemo},null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download=`can-ai-read-${isDemo?'example':new URL(current.url).hostname}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); });
demoButton.addEventListener('click',()=>render({url:'https://estudio.example/servicios',requestedUrl:'https://estudio.example/servicios',title:t("Estudio Norte — Diseño para marcas que avanzan"),analyzedAt:new Date().toISOString(),status:'limitations',words:246,internalLinks:8,robotsUrl:'https://estudio.example/robots.txt',scope:t("Una URL · HTML inicial · sin ejecutar JavaScript · datos de demostración"),excerpt:(locale === 'es' ? 'Estudio Norte. Diseño para marcas que avanzan.\n\nSomos un estudio de diseño independiente en Lima. Construimos identidades visuales y experiencias digitales para negocios que quieren comunicar con claridad.\n\nNuestros servicios\nIdentidad visual: estrategia, logotipo y sistema visual.\nDiseño web: sitios rápidos, accesibles y fáciles de mantener.\n\nTrabajamos con proyectos de todos los tamaños. Cuéntanos qué estás construyendo.\n\n[Texto ilustrativo. El precio de este ejemplo solo aparece dentro de una imagen y no forma parte del texto extraído.]' : 'Estudio Norte. Design for brands moving forward.\n\nWe are an independent design studio in Lima. We build visual identities and digital experiences for businesses that want to communicate clearly.\n\nOur services\nVisual identity: strategy, logo and visual system.\nWeb design: fast, accessible websites that are easy to maintain.\n\nWe work with projects of all sizes. Tell us what you are building.\n\n[Illustrative text. The price in this example only appears in an image and is not part of the extracted text.]'),findings:[{title:t("Respuesta del servidor"),state:'pass',evidence:t("HTTP 200 · 0 redirecciones · 24.8 KB de HTML (datos ficticios)."),action:t("La URL responde correctamente en este ejemplo.")},{title:t("Texto en el HTML inicial"),state:'pass',evidence:t("246 palabras extraídas en el ejemplo ilustrativo."),action:t("Revisa la vista de lectura para comprobar que incluye la información principal.")},{title:t("Descripción de la página"),state:'warning',evidence:t("No hay meta description en este ejemplo."),action:t("Añade un resumen descriptivo de la página. Esto no garantiza menciones en respuestas de IA.")},{title:t("Permisos de entrenamiento"),state:'info',evidence:t("GPTBot está restringido; OAI-SearchBot está permitido."),action:t("Son preferencias independientes. Bloquear entrenamiento no se trata como un error.")}],agents:[{name:'OAI-SearchBot',provider:'OpenAI',purpose:t("Búsqueda"),state:'allowed',evidence:t("Allow: / (ejemplo)")},{name:'Claude-SearchBot',provider:'Anthropic',purpose:t("Búsqueda"),state:'allowed',evidence:t("Allow: / (ejemplo)")},{name:'Googlebot',provider:'Google',purpose:t("Búsqueda"),state:'allowed',evidence:t("Allow: / (ejemplo)")},{name:'GPTBot',provider:'OpenAI',purpose:t("Entrenamiento"),state:'blocked',evidence:t("Disallow: / (ejemplo)")},{name:'ClaudeBot',provider:'Anthropic',purpose:t("Entrenamiento"),state:'blocked',evidence:t("Disallow: / (ejemplo)")}]},true));

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
