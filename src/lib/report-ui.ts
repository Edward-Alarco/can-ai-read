import { copy, type Finding, type Report } from './diagnostics';
import type { Locale } from './i18n';
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
  const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;
};
const at = (id:string)=>document.getElementById(id)!;
const order = {high:0,medium:1,low:2,none:3};
export function renderDiagnostics(data: Report,locale:Locale,demo:boolean) {
  const s=(en:string,es:string)=>copy(locale,en,es);
  const sorted=[...data.findings].sort((a,b)=>order[a.priority]-order[b.priority]||(a.state==='pass'?1:0)-(b.state==='pass'?1:0));
  const root=at('diagnostic-overview');root.replaceChildren();
  const heading=el('h3','',s('Know what to do next','Ten claro qué hacer ahora'));
  const explanation=el('p','overview-description',data.overview.highPriority?s('Start with the access restrictions below. Then review content and presentation improvements.','Empieza por las restricciones de acceso indicadas abajo. Después revisa las mejoras de contenido y presentación.'):data.overview.actions?s('We could retrieve the HTML. Review these opportunities to make the page clearer and more accessible to tools and people.','Pudimos obtener el HTML. Revisa estas oportunidades para que la página sea más clara y accesible para herramientas y personas.'):s('No priority actions were identified by these checks. Review the evidence and optional suggestions; visibility is not guaranteed.','Estas comprobaciones no identificaron acciones prioritarias. Revisa las evidencias y sugerencias opcionales; no se garantiza visibilidad.'));
  root.append(heading,explanation);
  const stats=el('div','audit-stat-grid');
  for(const [value,label] of [[data.overview.highPriority,s('High priority','Prioridad alta')],[data.overview.actions,s('Recommended actions','Acciones recomendadas')],[data.overview.passed,s('Passed checks','Comprobaciones correctas')],[data.overview.checks,s('Checks performed','Comprobaciones realizadas')]]) {const stat=el('div','audit-stat');stat.append(el('strong','',String(value)),el('span','',String(label)));stats.append(stat);}
  root.append(stats);
  const facts=el('p','audit-measurement',`${s('HTML received','HTML recibido')}: ${(data.metrics.htmlBytes/1024).toFixed(1)} KB · ${s('Analysis duration','Duración del análisis')}: ${(data.metrics.elapsedMs/1000).toFixed(2)} s · ${s('Heading elements','Encabezados')}: ${data.metrics.headings} · ${s('Images','Imágenes')}: ${data.metrics.images}`);
  root.append(facts,el('p','report-note',s('Technical observations, not an AI-understanding score. Duration includes our analysis requests; it is not a page-speed metric.','Observaciones técnicas, no una puntuación de comprensión de IA. La duración incluye nuestras solicitudes de análisis; no mide la velocidad de la página.')));
  const todo=sorted.filter(f=>f.priority!=='none'&&f.state!=='pass').slice(0,3);
  if(todo.length){const next=el('div','next-actions');next.append(el('h4','',s('Start here','Empieza por aquí')));const list=el('ol','');todo.forEach(f=>{const item=el('li','');const link=el('a','',f.userTitle);link.href=`#audit-${f.id}`;link.addEventListener('click',()=>{document.getElementById('tab-findings')?.click();selectFilter('all');(at(`audit-${f.id}`)as HTMLDetailsElement).open=true;});item.append(link);list.append(item);});next.append(list);root.append(next);}
  const controls=el('div','audit-filter-bar');controls.setAttribute('role','group');controls.setAttribute('aria-label',s('Filter findings','Filtrar hallazgos'));
  const filters=[['all',s('All checks','Todas')],['actions',s('Actions','Acciones')],['passed',s('Passed','Correctas')],['info',s('Information','Información')]];
  const buttons=new Map<string,HTMLButtonElement>();
  for(const [id,label] of filters){const button=el('button','audit-filter',label);button.type='button';button.addEventListener('click',()=>selectFilter(id));buttons.set(id,button);controls.append(button);}
  const reportActions=el('div','audit-report-actions');
  const repeat=el('button','secondary-button',s('Analyze again','Volver a analizar'));repeat.type='button';repeat.addEventListener('click',()=>{if(demo){(document.getElementById('site-url')as HTMLInputElement).focus();return;}(document.getElementById('site-url')as HTMLInputElement).value=data.url;(document.getElementById('audit-form')as HTMLFormElement).requestSubmit();});
  const copyPlan=el('button','secondary-button',s('Copy action plan','Copiar plan de acción'));copyPlan.type='button';
  copyPlan.addEventListener('click',async()=>{const text=[s('Page action plan','Plan de acción de la página'),data.url,...sorted.filter(f=>f.priority!=='none'&&f.state!=='pass').map(f=>`\n${f.userTitle}\n${f.action}\n${f.where}\n${f.steps.map((step,i)=>`${i+1}. ${step}`).join('\n')}\n${s('Verify','Verificar')}: ${f.verification}`)].join('\n');await copyText(text,copyPlan,s);});
  reportActions.append(copyPlan,repeat);
  const filtersHost=at('diagnostic-filters');filtersHost.replaceChildren(controls,reportActions);
  function selectFilter(filter:string){
    buttons.forEach((button,id)=>button.setAttribute('aria-pressed',String(filter===id)));
    const findings=sorted.filter(f=>filter==='all'||filter==='actions'&&(f.priority!=='none'&&f.state!=='pass')||filter==='passed'&&f.state==='pass'||filter==='info'&&f.state==='info');
    const host=at('findings-list');host.replaceChildren();
    if(!findings.length)host.append(el('p','audit-empty',s('No findings in this group.','No hay hallazgos en este grupo.')));
    findings.forEach((f,i)=>host.append(findingCard(f,s,i===0&&filter==='actions')));
    at('diagnostic-result-count').textContent=s(`${findings.length} checks shown. Expand a check to see evidence and steps.`,`${findings.length} comprobaciones mostradas. Despliega una para ver evidencias y pasos.`);
  }
  selectFilter('all');
  renderResources(data,s);
}
type Say=(en:string,es:string)=>string;
function findingCard(f:Finding,s:Say,open:boolean){
  const details=el('details',`audit-card audit-${f.state}`);details.id=`audit-${f.id}`;details.open=open;
  const summary=el('summary','audit-card-summary');
  const icon=el('img','audit-state-icon');icon.src=f.state==='pass'?'/checkcircle.svg':f.state==='warning'?'/warningcircle.svg':'/infocircle.svg';icon.alt='';icon.width=22;icon.height=22;
  const text=el('span','audit-summary-copy');text.append(el('strong','',f.userTitle),el('span','audit-summary-action',f.action));
  const badges=el('span','audit-badges');
  const status=f.state==='pass'?s('Passed','Correcto'):f.state==='warning'?s('Review','Revisar'):s('Information','Información');
  badges.append(el('span',`audit-badge ${f.state}`,status));
  if(f.priority!=='none')badges.append(el('span','audit-badge',f.priority==='high'?s('High priority','Prioridad alta'):f.priority==='medium'?s('Medium priority','Prioridad media'):s('Low priority','Prioridad baja')));
  summary.append(icon,text,badges);
  const body=el('div','audit-card-body');
  const section=(title:string,text:string)=>{const block=el('section','audit-explanation');block.append(el('h4','',title),el('p','',text));return block;};
  body.append(section(s('What we found','Qué encontramos'),f.evidence),section(s('What it means','Qué significa'),f.explanation),section(s('Why it matters','Por qué importa'),f.impact));
  const steps=el('section','audit-explanation');steps.append(el('h4','',s('What you can do','Qué puedes hacer')));const list=el('ol','audit-steps');f.steps.forEach(step=>list.append(el('li','',step)));steps.append(list);body.append(steps);
  body.append(section(s('Where to make the change · guidance, not verified source paths','Dónde cambiarlo · orientación, no rutas de origen verificadas'),f.where));
  if(f.evidenceRows.length){const block=el('section','audit-explanation');block.append(el('h4','',s('Observed evidence','Evidencia observada')),el('p','audit-small',s('Line numbers refer to the received HTML response, not files in your project. Entries and snippets are capped for readability.','Las líneas corresponden al HTML recibido, no a archivos de tu proyecto. Limitamos las entradas y fragmentos para facilitar su lectura.')));
    const table=el('table','audit-evidence');const caption=el('caption','sr-only',s('Location and observed value','Ubicación y valor observado'));table.append(caption);const head=el('thead','');const hr=el('tr','');for(const title of [s('Location / HTML line','Ubicación / línea HTML'),s('Observed value','Valor observado')]){const th=el('th','',title);th.scope='col';hr.append(th);}head.append(hr);table.append(head);const tbody=el('tbody','');f.evidenceRows.forEach(e=>{const row=el('tr','');row.append(el('td','',e.location+(e.line?` · ${s('line','línea')} ${e.line}`:'')));const td=el('td','');td.append(el('pre','',e.value));row.append(td);tbody.append(row);});table.append(tbody);const scroller=el('div','audit-table-scroll');scroller.append(table);block.append(scroller);body.append(block);
  }else body.append(el('p','audit-small',s('No matching element or sample was found in the inspected response.','No encontramos un elemento o muestra correspondiente en la respuesta inspeccionada.')));
  if(f.example){const example=el('section','audit-explanation');example.append(el('h4','',s('Example · adapt to your page','Ejemplo · adáptalo a tu página')),el('p','audit-small',s('Illustrative code, not a patch generated from your source. Do not overwrite existing settings with it.','Código ilustrativo, no un parche generado desde tu código fuente. No sobrescribas ajustes existentes con él.')));const pre=el('pre','audit-code');pre.append(el('code','',f.example));const button=el('button','secondary-button',s('Copy example','Copiar ejemplo'));button.type='button';button.addEventListener('click',()=>copyText(f.example!,button,s));example.append(pre,button);body.append(example);}
  body.append(section(s('How to verify the fix','Cómo verificar la corrección'),f.verification));
  const docs=el('a','audit-docs',s('Read official documentation ↗','Consultar documentación oficial ↗'));docs.href=f.documentation;docs.target='_blank';docs.rel='noopener noreferrer';body.append(docs);details.append(summary,body);return details;
}
async function copyText(text:string,button:HTMLButtonElement,s:Say){
  const label=button.textContent||'';
  try{await navigator.clipboard.writeText(text);button.textContent=s('Copied','Copiado');}
  catch{button.textContent=s('Could not copy; select the text manually','No se pudo copiar; selecciona el texto manualmente');}
  setTimeout(()=>{if(button.isConnected)button.textContent=label;},2500);
}
function renderResources(data:Report,s:Say){
  const host=at('diagnostic-resources');host.replaceChildren();
  const details=el('details','audit-resources');const summary=el('summary','',s('Published resources detected','Recursos publicados detectados'));details.append(summary,el('p','audit-small',s('These URLs were found in the page HTML. They were not audited individually and do not identify the private files you should edit.','Estas URLs se encontraron en el HTML. No se auditaron individualmente ni identifican los archivos privados que debes editar.')));
  if(data.resources.length){const list=el('ul','resource-list');data.resources.forEach(r=>list.append(el('li','',`${r.kind} · ${r.url}`)));details.append(list);}else details.append(el('p','audit-small',s('No stylesheet or script URLs were recorded.','No se registraron URLs de hojas de estilo o scripts.')));
  host.append(details);
}
