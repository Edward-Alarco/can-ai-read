import { copy, type Finding, type Report } from './diagnostics';
import { translator, type Locale } from './i18n';
import { computeScore, recoverablePoints, scoreRange, SCORE_WEIGHTS, SCORE_CAPS, SCORE_RANGES, type PageScore } from './score';
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
  const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;
};
const at = (id:string)=>document.getElementById(id)!;
const order = {high:0,medium:1,low:2,none:3};
export function renderDiagnostics(data: Report,locale:Locale) {
  const s=(en:string,es:string)=>copy(locale,en,es);
  const score=data.score??computeScore(data.findings);
  const recover=(id:string)=>recoverablePoints(data.findings,id);
  const sorted=[...data.findings].sort((a,b)=>order[a.priority]-order[b.priority]||(a.state==='pass'?1:0)-(b.state==='pass'?1:0));
  const actionable=sorted.filter(f=>f.priority!=='none'&&f.state!=='pass').sort((a,b)=>recover(b.id)-recover(a.id)||order[a.priority]-order[b.priority]);
  const preview=document.querySelector<HTMLElement>('.report-preview');
  preview?.remove();
  const root=at('diagnostic-overview');root.replaceChildren();
  const heading=el('h3','',s('Know what to do next','Ten claro qué hacer ahora'));
  const explanation=el('p','overview-description',data.overview.highPriority?s('Start with the access restrictions below. Then review content and presentation improvements.','Empieza por las restricciones de acceso indicadas abajo. Después revisa las mejoras de contenido y presentación.'):data.overview.actions?s('We could retrieve the HTML. Review these opportunities to make the page clearer and more accessible to tools and people.','Pudimos obtener el HTML. Revisa estas oportunidades para que la página sea más clara y accesible para herramientas y personas.'):s('No priority actions were identified by these checks. Review the evidence and optional suggestions; visibility is not guaranteed.','Estas comprobaciones no identificaron acciones prioritarias. Revisa las evidencias y sugerencias opcionales; no se garantiza visibilidad.'));
  root.append(heading,explanation);
  const stats=el('div','audit-stat-grid');
  const number= (value:number)=>value.toLocaleString(locale==='es'?'es-PE':'en-US');
  for(const [value,label,id] of [
    [data.overview.highPriority,s('High priority','Prioridad alta'),''],
    [data.overview.actions,s('Recommended actions','Acciones recomendadas'),''],
    [data.overview.passed,s('Passed checks','Comprobaciones correctas'),''],
    [data.overview.checks,s('Checks performed','Comprobaciones realizadas'),''],
    [data.words,s('Words extracted','Palabras extraídas'),'word-count'],
    [data.internalLinks,s('Internal links','Enlaces internos'),'link-count'],
  ] as [number,string,string][]) {
    const stat=el('div','audit-stat');
    const strong=el('strong','',number(value));
    if(id)strong.id=id;
    stat.append(strong,el('span','',label));
    stats.append(stat);
  }
  const statsRow=el('div','overview-stats');
  statsRow.append(stats);
  if(preview)statsRow.append(preview);
  root.append(statsRow);
  const facts=el('p','audit-measurement',`${s('HTML received','HTML recibido')}: ${(data.metrics.htmlBytes/1024).toFixed(1)} KB · ${s('Analysis duration','Duración del análisis')}: ${(data.metrics.elapsedMs/1000).toFixed(2)} s · ${s('Heading elements','Encabezados')}: ${data.metrics.headings} · ${s('Images','Imágenes')}: ${data.metrics.images}`);
  root.append(facts,el('p','report-note',s('The score measures observable technical readability from these checks, not whether an AI understands, indexes or will cite the page. Duration includes our analysis requests; it is not a page-speed metric.','La puntuación mide la legibilidad técnica observable de estas comprobaciones, no si una IA entiende, indexa o citará la página. La duración incluye nuestras solicitudes de análisis; no mide la velocidad de la página.')));
  const todo=actionable.slice(0,3);
  if(todo.length){const next=el('div','next-actions');next.append(el('h4','',s('Start here','Empieza por aquí')));const list=el('ol','');todo.forEach(f=>{const item=el('li','');const link=el('a','',f.userTitle);link.href=`#audit-${f.id}`;link.addEventListener('click',()=>{document.getElementById('tab-findings')?.click();selectFilter('all');(at(`audit-${f.id}`)as HTMLDetailsElement).open=true;});item.append(link);const gain=recover(f.id);if(gain){const hint=el('span','action-gain',s(`+${gain} pts · would reach ${score.score+gain}`,`+${gain} pts · subirías a ${score.score+gain}`));item.append(hint);}list.append(item);});next.append(list);root.append(next);}
  const controls=el('div','audit-filter-bar');controls.setAttribute('role','group');controls.setAttribute('aria-label',s('Filter findings','Filtrar hallazgos'));
  const filters=[['all',s('All checks','Todas')],['actions',s('Actions','Acciones')],['passed',s('Passed','Correctas')],['info',s('Information','Información')]];
  const buttons=new Map<string,HTMLButtonElement>();
  for(const [id,label] of filters){const button=el('button','audit-filter',label);button.type='button';button.addEventListener('click',()=>selectFilter(id));buttons.set(id,button);controls.append(button);}
  const filtersHost=at('diagnostic-filters');filtersHost.replaceChildren(controls);
  function selectFilter(filter:string){
    buttons.forEach((button,id)=>button.setAttribute('aria-pressed',String(filter===id)));
    const source=filter==='actions'?actionable:sorted;
    const findings=source.filter(f=>filter==='all'||filter==='actions'&&(f.priority!=='none'&&f.state!=='pass')||filter==='passed'&&f.state==='pass'||filter==='info'&&f.state==='info');
    const host=at('findings-list');host.replaceChildren();
    if(!findings.length)host.append(el('p','audit-empty',s('No findings in this group.','No hay hallazgos en este grupo.')));
    findings.forEach((f,i)=>host.append(findingCard(f,s,i===0&&filter==='actions',score.perFinding.find(item=>item.id===f.id)?.deducted??0)));
    at('diagnostic-result-count').textContent=s(`${findings.length} checks shown. Expand a check to see evidence and steps.`,`${findings.length} comprobaciones mostradas. Despliega una para ver evidencias y pasos.`);
  }
  renderScoreCard(score,data,s,locale);
  selectFilter('all');
  renderResources(data,s);
}
type Say=(en:string,es:string)=>string;
function findingCard(f:Finding,s:Say,open:boolean,deducted:number){
  const details=el('details',`audit-card audit-${f.state}`);details.id=`audit-${f.id}`;details.open=open;
  const summary=el('summary','audit-card-summary');
  const icon=el('img','audit-state-icon');icon.src=f.state==='pass'?'/checkcircle.svg':f.state==='warning'?'/warningcircle.svg':'/infocircle.svg';icon.alt=f.state==='pass'?s('Passed','Correcto'):f.state==='warning'?s('Review','Revisar'):s('Information','Información');icon.width=22;icon.height=22;
  const text=el('span','audit-summary-copy');text.append(el('strong','',f.userTitle),el('span','audit-summary-action',f.action));
  const badges=el('span','audit-badges');
  if(f.state!=='pass'){const status=f.state==='warning'?s('Review','Revisar'):s('Information','Información');badges.append(el('span',`audit-badge ${f.state}`,status));}
  if(f.priority!=='none')badges.append(el('span','audit-badge',f.priority==='high'?s('High priority','Prioridad alta'):f.priority==='medium'?s('Medium priority','Prioridad media'):s('Low priority','Prioridad baja')));
  if(deducted>0)badges.append(el('span','audit-badge deduction',`\u2212${deducted}`));
  const toggle=el('span','audit-toggle');toggle.setAttribute('aria-hidden','true');
  const plus=el('img','audit-plus');plus.src='/plus.svg';plus.alt=s('Expand','Expandir');plus.width=14;plus.height=14;
  const minus=el('img','audit-minus');minus.src='/minus.svg';minus.alt=s('Collapse','Contraer');minus.width=14;minus.height=14;
  toggle.append(plus,minus);
  summary.append(icon,text,badges,toggle);
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
function verdictText(score:PageScore,data:Report,s:Say):string{
  if(score.cap?.reason==='unreachable')return s('Unreachable: the page could not be retrieved','Inaccesible: no pudimos obtener la página');
  if(score.cap?.reason==='noindex')return s('Blocked: noindex detected','Bloqueado: noindex detectado');
  if(score.cap?.reason==='search-blocked')return s('Blocked: search crawlers restricted','Bloqueado: rastreadores de búsqueda restringidos');
  if(score.cap?.reason==='thin-content')return s('Limited: very little initial HTML text','Limitado: muy poco texto en el HTML inicial');
  if(!data.overview.actions)return s('Accessible, no priority actions identified','Accesible, sin acciones prioritarias');
  return data.overview.actions===1?s('Accessible, 1 improvement recommended','Accesible, 1 mejora recomendada'):s(`Accessible, ${data.overview.actions} improvements recommended`,`Accesible, ${data.overview.actions} mejoras recomendadas`);
}
function groupLabel(id:PageScore['groups'][number]['id'],s:Say){
  return id==='access'?s('Access','Acceso'):id==='content'?s('Content','Contenido'):s('Signals','Señales');
}
function renderScoreCard(score:PageScore,data:Report,s:Say,locale:Locale){
  const host=at('report-score') as HTMLDivElement;
  host.hidden=false;
  host.replaceChildren();
  host.className='report-score';
  host.dataset.range=scoreRange(score.score);
  const verdict=verdictText(score,data,s);
  host.setAttribute('aria-label',s(`AI readability ${score.score} out of 100. ${verdict}`,`Legibilidad para IA ${score.score} de 100. ${verdict}`));
  const wrap=el('div','score-ring-wrap');
  wrap.setAttribute('aria-hidden','true');
  wrap.innerHTML=`<svg class="score-ring" viewBox="0 0 36 36"><circle class="score-ring-track" cx="18" cy="18" r="16" pathLength="100"></circle><circle class="score-ring-value" cx="18" cy="18" r="16" pathLength="100"></circle></svg>`;
  const figure=el('div','score-figure');
  const value=el('span','score-number','0');value.id='score-value';
  figure.append(value,el('span','score-denom','/100'));
  wrap.append(figure);
  const details=el('div','score-copy');
  details.append(el('p','score-label',s('AI readability','Legibilidad para IA')),el('p','score-verdict',verdict));
  const groups=el('div','score-groups');
  score.groups.forEach(group=>{
    const row=el('div','score-group');
    row.append(el('span','',groupLabel(group.id,s)),el('span','',`${group.points}/${group.max}`));
    const bar=el('div','score-bar');const fill=el('i','');fill.style.width=`${group.max?Math.round(group.points/group.max*100):0}%`;bar.append(fill);row.append(bar);
    groups.append(row);
  });
  details.append(groups);
  const t=translator(locale);
  const method=el('button','score-method',t('¿Cómo funciona?'));
  method.type='button';
  method.addEventListener('click',()=>openScoreDialog(locale,method));
  details.append(method);
  host.append(wrap,details);
  animateScore(value,host.querySelector('.score-ring-value') as SVGCircleElement,score.score);
}
function scoreDialogTable(t:ReturnType<typeof translator>, rows:[string,number,string][]){
  const table=el('table','score-dialog-table');
  const head=el('thead','');const hr=el('tr','');
  for(const title of [t('Comprobación'),t('Puntos'),t('Qué miramos')]){const th=el('th','',title);th.scope='col';hr.append(th);}
  head.append(hr);table.append(head);
  const body=el('tbody','');
  rows.forEach(([name,points,detail])=>{
    const row=el('tr','');
    row.append(el('td','',name),el('td','',String(points)),el('td','',detail));
    body.append(row);
  });
  table.append(body);
  const scroller=el('div','score-dialog-table-scroll');
  scroller.append(table);
  return scroller;
}
function openAppDialog(options:{id:string;title:string;closeLabel:string;opener?:HTMLElement;actions?:HTMLButtonElement[];build:(body:HTMLDivElement,dialog:HTMLDialogElement)=>void}){
  document.getElementById(options.id)?.remove();
  const dialog=document.createElement('dialog');
  dialog.id=options.id;
  dialog.className='score-dialog';
  dialog.setAttribute('aria-labelledby',`${options.id}-title`);
  const card=el('div','score-dialog-card');
  const top=el('div','score-dialog-top');
  const title=el('p','score-dialog-title',options.title);title.id=`${options.id}-title`;
  const close=el('button','score-dialog-close',options.closeLabel);
  close.type='button';
  close.addEventListener('click',()=>dialog.close());
  const actions=el('div','score-dialog-actions');
  (options.actions||[]).forEach(button=>actions.append(button));
  actions.append(close);
  top.append(title,actions);
  const body=el('div','score-dialog-body');
  options.build(body,dialog);
  card.append(top,body);
  dialog.append(card);
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{dialog.remove();options.opener?.focus();});
  document.body.append(dialog);
  dialog.showModal();
}
function openScoreDialog(locale:Locale,opener?:HTMLElement){
  const t=translator(locale);
  openAppDialog({
    id:'score-dialog',
    title:t('¿Cómo funciona?'),
    closeLabel:t('Cerrar'),
    opener,
    build(body){
  const heading=(text:string)=>el('h3','',text);
  const para=(text:string)=>el('p','',text);
  const access=SCORE_WEIGHTS.access, content=SCORE_WEIGHTS.content, signals=SCORE_WEIGHTS.signals;
  body.append(
    heading(t('Qué hace esta herramienta')),
    para(t('Al analizar una dirección, visitamos esa página pública casi como lo haría un rastreador. Pedimos el HTML que envía el servidor, sin ejecutar JavaScript, revisamos las reglas de robots.txt y tomamos una captura de pantalla solo como referencia visual. El informe se basa en lo que realmente aparece en esa respuesta, no en suposiciones.')),
    heading(t('Qué mide la puntuación (y qué no)')),
    para(t('La nota va de 0 a 100 y resume qué tan fácil es, en términos técnicos, que una máquina lea tu página. Se basa en tres bloques que podemos observar: si se puede acceder a ella, si el texto importante está en el HTML y si la página se describe con claridad.')),
    para(t('No predice si una inteligencia artificial va a “entender” tu contenido, ni si Google u otro servicio te va a indexar, posicionar o citar en ChatGPT, Claude o las respuestas de Google. Una nota alta significa que no vimos barreras técnicas evidentes; no es una garantía de visibilidad.')),
    heading(t('Los tres bloques de la nota')),
    el('p','score-dialog-group',t('Acceso ({0} puntos)',access.max)),
    para(t('Comprueba si se puede abrir la página y si los rastreadores de búsqueda tienen permiso para entrar.')),
    scoreDialogTable(t,[
      [t('Respuesta del servidor'),access.checks.server,t('Si la página respondió bien y pudimos obtenerla.')],
      [t('Directivas de indexación'),access.checks.indexing,t('Si hay indicaciones, como noindex, que piden no indexar la página o no mostrar fragmentos.')],
      [t('Permisos de rastreadores de búsqueda'),access.checks['search-access'],t('Si los rastreadores de búsqueda de Google, OpenAI o Anthropic tienen el acceso restringido en robots.txt para esta dirección.')],
    ]),
    el('p','score-dialog-group',t('Contenido ({0} puntos)',content.max)),
    para(t('Comprueba si el texto real de la página está ahí, sin necesidad de ejecutar código.')),
    scoreDialogTable(t,[
      [t('Texto en el HTML inicial'),content.checks.text,t('Cuánto texto principal llega en la primera respuesta del servidor.')],
      [t('Encabezado principal'),content.checks.headings,t('Si hay un encabezado principal (H1) claro que nombre el tema de la página.')],
      [t('Enlaces internos extraíbles'),content.checks.links,t('Si hay enlaces HTML hacia otras páginas de tu propio sitio.')],
      [t('Texto alternativo de las imágenes'),content.checks.images,t('Si las imágenes tienen un texto alternativo (atributo alt) que las describa.')],
    ]),
    el('p','score-dialog-group',t('Señales ({0} puntos)',signals.max)),
    para(t('Comprueba si la página dice con claridad de qué trata.')),
    scoreDialogTable(t,[
      [t('Título y descripción'),signals.checks.metadata,t('El título y el resumen que suelen verse al compartir o encontrar la página.')],
      [t('URL canónica'),signals.checks.canonical,t('La dirección que la propia página señala como la preferida para este contenido.')],
      [t('Datos estructurados'),signals.checks.schema,t('Un formato opcional (JSON-LD) que describe el contenido de forma ordenada.')],
    ]),
    heading(t('Cómo se restan los puntos')),
    para(t('Si una comprobación sale correcta o solo es informativa, suma todos sus puntos. Las comprobaciones informativas nunca restan.')),
    para(t('Si hay algo que conviene revisar (una advertencia), la prioridad decide cuánto suma esa comprobación:')),
  );
  const deduct=el('ul','');
  for(const item of [
    t('Prioridad alta: no suma puntos en esa comprobación (0 %).'),
    t('Prioridad media: suma la mitad (50 %).'),
    t('Prioridad baja: suma tres cuartas partes (75 %).'),
  ]) deduct.append(el('li','',item));
  body.append(
    deduct,
    para(t('Bloquear rastreadores de entrenamiento, como GPTBot o ClaudeBot, es una decisión tuya y no baja la nota. Mostramos esas reglas por separado, porque no es lo mismo impedir que usen tu contenido para entrenar un modelo que impedir que te encuentren en una búsqueda.')),
    heading(t('Cuando un problema pone un techo')),
    para(t('Algunos problemas son tan serios que la nota no puede subir de cierto nivel, aunque el resto de la página esté bien:')),
  );
  const caps=el('ul','');
  caps.append(
    el('li','',t('Si hay un noindex (o una restricción equivalente), si los rastreadores de búsqueda están bloqueados en robots.txt, o si el HTML inicial trae muy poco texto, la nota no pasa de {0}.',SCORE_CAPS.noindex)),
    el('li','',t('Si no pudimos obtener la página, la nota no pasa de {0}.',SCORE_CAPS.unreachable)),
  );
  body.append(
    caps,
    para(t('Por eso un solo bloqueo importante puede dejar la puntuación baja aunque otras comprobaciones estén en verde.')),
    heading(t('Cómo te ayuda esta nota')),
  );
  const ranges=el('ul','');
  ranges.append(
    el('li','',t('{0} a {1}: en lo que podemos observar, la página se puede leer con facilidad. Puede haber mejoras menores, pero no vimos barreras graves.',SCORE_RANGES.good,100)),
    el('li','',t('{0} a {1}: la página es accesible, aunque hay cosas concretas que conviene corregir para que se lea mejor.',SCORE_RANGES.mid,SCORE_RANGES.good-1)),
    el('li','',t('Menos de {0}: encontramos obstáculos importantes, o un problema que limita la nota. Empieza por lo que aparece al inicio del plan de acción.',SCORE_RANGES.mid)),
  );
  body.append(
    ranges,
    para(t('El plan de acción está ordenado por los puntos que recuperarías al corregir cada hallazgo. Cuando hagas un cambio, publícalo, espera a que se actualice y vuelve a analizar la misma dirección para comprobar la nueva nota y las evidencias.')),
  );
    },
  });
}
export function openTabsGuideDialog(locale:Locale,opener?:HTMLElement){
  const t=translator(locale);
  openAppDialog({
    id:'tabs-guide-dialog',
    title:t('¿Qué hay en cada pestaña?'),
    closeLabel:t('Cerrar'),
    opener,
    build(body){
      const heading=(text:string)=>el('h3','',text);
      const para=(text:string)=>el('p','',text);
      const use=(text:string)=>el('p','score-dialog-use',text);
      body.append(
        para(t('El informe se divide en tres vistas del mismo análisis. Aquí te explicamos qué verás en cada una y para qué te sirve.')),
        heading(t('01 Diagnóstico')),
        para(t('Aquí están las 10 comprobaciones que hicimos en tu página. Cada una te dice si está bien, si conviene revisarla o si es solo informativa.')),
        para(t('Abre cada comprobación con el signo «+» para ver por qué importa, qué encontramos y cómo puedes mejorarlo. El recuadro «−N» indica cuántos puntos le resta a tu puntuación. Con los filtros puedes ver solo lo que hay que corregir.')),
        use(t('Para qué te sirve: saber qué conviene corregir primero.')),
        heading(t('02 Rastreadores')),
        para(t('Google, ChatGPT y Claude usan programas automáticos (llamados rastreadores o bots) para visitar sitios web. Tu sitio puede dejarlos entrar o dejarlos fuera con un archivo llamado robots.txt, como un letrero en la puerta.')),
        para(t('Esta pestaña te muestra, para cada uno, si tu letrero les permite entrar a esta página.')),
        para(t('Hay dos tipos. Los de búsqueda ayudan a que te encuentren en Google, ChatGPT o Claude: si los bloqueas, casi no aparecerás ahí. Los de entrenamiento leen tu contenido para entrenar futuras inteligencias artificiales: bloquearlos es una decisión tuya y no baja tu puntuación.')),
        para(t('Ojo: leemos el letrero; no podemos confirmar si realmente te visitaron.')),
        use(t('Para qué te sirve: asegurarte de que no estás cerrando la puerta, sin querer, a los buscadores y a los asistentes.')),
        heading(t('03 Vista de lectura')),
        para(t('Aquí ves el texto de tu página tal como lo lee una máquina: sin diseño, sin imágenes y sin botones. Sale de lo que tu servidor envía al principio, en la primera respuesta.')),
        para(t('Si algo importante no aparece aquí —por ejemplo, precios, descripciones de productos o datos de contacto—, es probable que una máquina tampoco pueda leerlo. A menudo ocurre porque ese contenido se carga después, con código.')),
        use(t('Para qué te sirve: comprobar que tu contenido importante sí es visible para las máquinas.')),
      );
    },
  });
}
function animateScore(value:HTMLElement,ring:SVGCircleElement,target:number){
  const reduced=typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const apply=(current:number)=>{value.textContent=String(Math.round(current));ring.style.strokeDasharray=`${current} 100`;};
  if(reduced){apply(target);return;}
  const started=performance.now(),duration=900;
  const tick=(now:number)=>{
    if(!value.isConnected)return;
    const t=Math.min(1,(now-started)/duration);
    const eased=1-Math.pow(1-t,3);
    apply(target*eased);
    if(t<1)requestAnimationFrame(tick);
  };
  apply(0);
  requestAnimationFrame(tick);
}
