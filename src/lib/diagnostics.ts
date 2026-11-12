import { translator, type Locale } from './i18n';
export type Evidence = { location: string; value: string; line?: number };
export type AgentResult = { name: string; provider: string; purpose: string; state: string; evidence: string };
export type AuditFacts = {
  url: string; requestedUrl: string; analyzedAt: string; statusCode: number; redirects: number; htmlBytes: number; elapsedMs: number;
  title: string; description: string; directives: string; canonical: string; canonicalUrl: string;
  headings: { level: number; text: string; line?: number }[]; words: number; internalLinks: number; excerpt: string;
  jsonLd: { valid: boolean; types: string[]; snippet: string; line?: number }[];
  images: { src: string; alt: string | null; line?: number }[];
  agents: AgentResult[]; robotsUrl: string; robotsExcerpt: string; platform: 'wordpress' | 'shopify' | 'astro' | 'next' | 'unknown';
  resources: { kind: string; url: string }[]; evidence: Record<string, Evidence[]>;
};
export type Finding = {
  id: string; title: string; userTitle: string; category: 'access' | 'content' | 'structure';
  state: 'pass' | 'warning' | 'info'; priority: 'high' | 'medium' | 'low' | 'none';
  evidence: string; action: string; explanation: string; impact: string; steps: string[];
  where: string; verification: string; evidenceRows: Evidence[]; example?: string; documentation: string;
};
export const copy = (locale: Locale, en: string, es: string) => locale === 'es' ? es : en;
const docs = {
  search: 'https://developers.google.com/search/docs/appearance/ai-features',
  js: 'https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics',
  robots: 'https://developers.openai.com/api/docs/bots',
  indexing: 'https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag',
  snippets: 'https://developers.google.com/search/docs/appearance/snippet',
  canonical: 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls',
  schema: 'https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data',
  images: 'https://www.w3.org/WAI/tutorials/images/decision-tree/',
};
export function correctionLocation(f: AuditFacts, area: 'head' | 'body' | 'robots' | 'headers', locale: Locale): string {
  const s = (en: string, es: string) => copy(locale,en,es);
  if (area === 'robots') return s('Review the public /robots.txt resource or the robots settings in your CMS/CDN. It may be generated dynamically; we cannot identify its source file.', 'Revisa el recurso público /robots.txt o los ajustes de robots de tu CMS/CDN. Puede generarse dinámicamente; no podemos identificar su archivo de origen.');
  if (area === 'headers') return s('Hosting/CDN response-header settings, server configuration or application middleware. We cannot inspect these private settings.', 'Configuración de cabeceras del hosting/CDN, servidor o middleware de la aplicación. No podemos inspeccionar estos ajustes privados.');
  const places = {
    wordpress: s('WordPress indicators detected. Usually: the page editor and SEO plugin settings. For templates, ask a developer to inspect the active theme; its source path is not verified.', 'Detectamos señales de WordPress. Habitualmente: editor de la página y ajustes del plugin SEO. Para plantillas, pide revisar el tema activo; no verificamos su ruta de origen.'),
    shopify: s('Shopify indicators detected. Usually: the page/product editor, search-engine listing settings, or a theme section. Ask a developer to identify the generating template.', 'Detectamos señales de Shopify. Habitualmente: editor de página/producto, ajustes del listado en buscadores o sección del tema. Un desarrollador debe identificar la plantilla que lo genera.'),
    astro: s('Astro indicators detected. Common locations: src/layouts/*.astro for shared metadata, src/pages/*.astro or a content source for page-specific text. These are suggestions, not verified source files.', 'Detectamos señales de Astro. Ubicaciones habituales: src/layouts/*.astro para metadatos compartidos; src/pages/*.astro o la fuente de contenido para textos de una página. Son sugerencias, no archivos verificados.'),
    next: s('Next.js indicators detected. Common locations: app/layout.tsx, page metadata or page components. The actual source path cannot be determined from this URL.', 'Detectamos señales de Next.js. Ubicaciones habituales: app/layout.tsx, metadatos de página o sus componentes. La ruta real no puede determinarse desde esta URL.'),
    unknown: s('In your CMS: page content or SEO settings. In a custom website: the page template or shared layout. A public URL does not reveal which private source file generates this HTML.', 'En tu CMS: contenido de la página o ajustes SEO. En una web a medida: plantilla de página o layout compartido. La URL pública no revela qué archivo privado genera este HTML.'),
  };
  return places[f.platform] + (area === 'head' ? s(' Look for the <head> metadata.', ' Busca los metadatos del <head>.') : '');
}
export function buildFindings(f: AuditFacts, locale: Locale): Finding[] {
  const s = (en: string, es: string) => copy(locale,en,es), t = translator(locale);
  const h1 = f.headings.filter(h=>h.level===1);
  const restricted = /\b(noindex|nosnippet|none)\b/i.test(f.directives);
  const lowText = f.words < 80;
  const genericH1 = h1.some(h=>/^(home|inicio|welcome|bienvenidos?|untitled)$/i.test(h.text.trim()));
  const badSchema = f.jsonLd.some(j=>!j.valid);
  const blocked = f.agents.filter(a=>['OAI-SearchBot','Claude-SearchBot','Googlebot'].includes(a.name)&&a.state==='blocked');
  const unknown = f.agents.some(a=>a.state==='unknown');
  const missingAlt = f.images.filter(i=>i.alt === null);
  const fields = (id: string) => f.evidence[id] || [];
  const recheck = s('Publish the change, clear the relevant cache and analyze this exact URL again. Compare the new evidence with this report.', 'Publica el cambio, limpia la caché correspondiente y vuelve a analizar esta misma URL. Compara las evidencias del nuevo informe.');
  const base = (id: string, title: string, userTitle: string, category: Finding['category'], state: Finding['state'], priority: Finding['priority'], rest: Omit<Finding,'id'|'title'|'userTitle'|'category'|'state'|'priority'>): Finding => ({id,title,userTitle,category,state,priority,...rest});
  return [
    base('server',t('Respuesta del servidor'),s('We could open your page','Pudimos abrir tu página'),'access','pass','none',{
      evidence:t`HTTP ${f.statusCode} · ${f.redirects} redirecciones · ${(f.htmlBytes/1024).toFixed(1)} KB de HTML`,
      action:s('No access error was observed in this request.','No observamos un error de acceso en esta solicitud.'),
      explanation:s('The server returned a successful HTML response to our analyzer. This is the first step before extracting information.','El servidor devolvió una respuesta HTML correcta a nuestro analizador. Es el primer paso para extraer información.'),
      impact:s('This confirms access for our request, not for every official crawler. A status 200 alone does not verify that the page contains the expected content.','Confirma el acceso de nuestra solicitud, no el de cada rastreador oficial. Un estado 200 por sí solo no verifica que la página contenga el contenido esperado.'),
      steps:[s('Review the reading view to check that the expected page text was returned.','Revisa la vista de lectura para comprobar que llegó el texto esperado.'),s('If an official crawler still fails, review hosting/CDN logs for that crawler rather than changing content blindly.','Si un rastreador oficial falla, revisa sus solicitudes en los logs del hosting/CDN antes de cambiar contenido.')],
      where:correctionLocation(f,'headers',locale),verification:recheck,evidenceRows:fields('server'),documentation:docs.search,
    }),
    base('text',t('Texto en el HTML inicial'),lowText?s('Very little page text was extracted','Extraímos muy poco texto de la página'):s('Your page contains readable text','Tu página contiene texto que podemos leer'),'content',lowText?'warning':'pass',lowText?'medium':'none',{
      evidence:t`${f.words} palabras extraídas del contenido principal.`,
      action:lowText?s('Check whether the important information is present before JavaScript runs.','Comprueba si la información importante está disponible antes de ejecutar JavaScript.'):s('Confirm that the extracted text includes your main services, products or explanation.','Confirma que el texto extraído incluye tus servicios, productos o explicación principal.'),
      explanation:s('We read the initial HTML, without running JavaScript. Navigation, headers and footers are excluded from the main-text extraction.','Leemos el HTML inicial sin ejecutar JavaScript. Excluimos navegación, cabeceras y pies de página de la extracción principal.'),
      impact:s('Some tools may miss content that appears only after scripts or clicks. The 80-word threshold is a review heuristic, not an AI or Google requirement; a short page can be valid.','Algunas herramientas pueden perder contenido que aparece solo después de scripts o clics. El umbral de 80 palabras es una señal de revisión, no un requisito de IA o Google; una página corta puede ser válida.'),
      steps:[s('Open Reading view and identify missing essential information.','Abre Vista de lectura e identifica información esencial que falte.'),s('Add real, useful descriptions as HTML text, rather than only images, canvas content or interaction-only sections.','Añade descripciones útiles como texto HTML, en vez de dejarlas solo en imágenes, canvas o secciones que requieren interacción.'),s('If scripts generate the main content, ask your developer about server rendering or pre-rendering. Do not add filler just to reach a word count.','Si los scripts generan el contenido principal, consulta a tu desarrollador sobre renderizado en servidor o prerenderizado. No añadas relleno para llegar a un número de palabras.')],
      where:correctionLocation(f,'body',locale),verification:recheck,evidenceRows:fields('text'),example:'<main>\n  <h1>Your service or product</h1>\n  <p>Describe what you offer and who it helps.</p>\n</main>',documentation:docs.js,
    }),
    base('indexing',t('Directivas de indexación'),restricted?s('A directive restricts indexing or snippets','Una directiva restringe la indexación o los fragmentos'):s('No restrictive indexing directive detected','No detectamos directivas restrictivas de indexación'),'access',restricted?'warning':'pass',restricted?'high':'none',{
      evidence:f.directives||t('No detectamos restricciones en meta robots ni X-Robots-Tag.'),
      action:restricted?s('Check whether the restriction is intentional for this public page.','Comprueba si la restricción es intencional para esta página pública.'):s('No change is needed based on the directives inspected.','No hace falta cambiar las directivas inspeccionadas.'),
      explanation:s('A noindex directive asks supported search engines not to index a page. nosnippet limits result snippets. A named agent rule may apply only to that agent.','Una directiva noindex pide a los buscadores que la respetan no indexar la página. nosnippet limita los fragmentos de resultados. Una regla con nombre de agente puede aplicarse solo a ese agente.'),
      impact:s('These settings can limit eligibility in search experiences. They do not necessarily prevent a user-triggered tool from reading a public URL.','Estos ajustes pueden limitar la aparición en experiencias de búsqueda. No necesariamente impiden que una herramienta lea una URL pública a petición de un usuario.'),
      steps:[s('Check the exact meta tag and/or HTTP header shown below, including the agent it targets.','Revisa la etiqueta meta o cabecera HTTP mostrada abajo, incluido el agente al que se dirige.'),s('If this page should be discoverable, ask the owner/developer to remove only unintended restrictions. Keep private, staging or intentionally excluded pages restricted.','Si debe encontrarse en búsquedas, pide eliminar solo restricciones no deseadas. Mantén restringidas las páginas privadas, de pruebas o excluidas intencionalmente.'),s('Publish and then inspect indexing in your search-engine webmaster tools; this checker cannot confirm indexing.','Publica y revisa la indexación en las herramientas para webmasters; este analizador no confirma la indexación.')],
      where:correctionLocation(f,'head',locale)+' '+correctionLocation(f,'headers',locale),verification:recheck,evidenceRows:fields('indexing'),documentation:docs.indexing,
    }),
    base('metadata',t('Título y descripción'),!f.title||!f.description?s('Complete the page title or description','Completa el título o la descripción de la página'):s('Your page has a title and description','Tu página tiene título y descripción'),'content',f.title&&f.description?'pass':'warning',!f.title?'medium':!f.description?'low':'none',{
      evidence:t`Título: ${f.title||t('ausente')}. Descripción: ${f.description||t('ausente')}`,
      action:s('Use a specific title and a short, accurate page summary.','Usa un título específico y un resumen breve y fiel a la página.'),
      explanation:s('The title names the page. A meta description summarizes it and may be used as a search snippet. These are separate from the visible heading.','El título identifica la página. La meta description la resume y puede usarse como fragmento en buscadores. Son distintos del encabezado visible.'),
      impact:s('A missing description is a presentation opportunity, not proof that AI cannot understand your page or a requirement for AI citations.','Una descripción ausente es una oportunidad de presentación, no prueba de que la IA no entienda la página ni un requisito para recibir citas.'),
      steps:[s('Write a unique title describing the actual page, not just your brand.','Escribe un título único que describa la página, no solo tu marca.'),s('Add a useful summary of the actual content in the page SEO settings or <head>. Avoid invented claims.','Añade un resumen útil del contenido real en los ajustes SEO o el <head>. Evita afirmaciones inventadas.')],
      where:correctionLocation(f,'head',locale),verification:recheck,evidenceRows:fields('metadata'),example:'<title>Page topic | Your brand</title>\n<meta name="description" content="A clear summary of this page’s actual content.">',documentation:docs.snippets,
    }),
    base('headings',t('Encabezado principal'),genericH1?s('Your main heading is too generic','Tu encabezado principal es demasiado genérico'):!h1.length?s('Review your page headings','Revisa los encabezados de tu página'):s('Review how your main topic is named','Revisa cómo nombras el tema principal'),'structure',genericH1||!h1.length||h1.length>1?'info':'pass',genericH1||!h1.length?'low':'none',{
      evidence:t`${h1.length} encabezados H1 detectados${h1[0]?.text?': '+h1[0].text:'.'}`,
      action:s('Prefer a descriptive main heading over generic labels such as “Home”.','Prefiere un encabezado descriptivo en lugar de etiquetas genéricas como «Inicio».'),
      explanation:s('Headings organize what a page is about and make sections easier to navigate. We inspect heading elements, not their visual size.','Los encabezados organizan el tema de la página y ayudan a navegar sus secciones. Inspeccionamos etiquetas de encabezado, no su tamaño visual.'),
      impact:s('“Home” gives little context about what you offer. Multiple H1s are not automatically an error, and heading counts do not determine AI visibility.','«Inicio» aporta poco contexto sobre lo que ofreces. Tener varios H1 no es automáticamente un error y su cantidad no determina la visibilidad en IA.'),
      steps:[s('Make the main heading describe the page’s real offer or topic.','Haz que el encabezado principal describa la oferta o tema real de la página.'),s('Use section headings to group related information. Check the heading list below before changing your templates.','Usa encabezados de sección para agrupar información relacionada. Revisa la lista detectada antes de cambiar plantillas.')],
      where:correctionLocation(f,'body',locale),verification:recheck,evidenceRows:fields('headings'),example:'<h1>Pet food and supplies in Lima</h1>\n<h2>Food for dogs</h2>\n<h2>Food for cats</h2>',documentation:docs.search,
    }),
    base('canonical',t('URL canónica'),f.canonicalUrl&&f.canonicalUrl!==f.url?s('This page points to another preferred URL','La página señala otra URL como preferida'):s('Check the preferred URL for this content','Comprueba la URL preferida para este contenido'),'structure',f.canonical&&!f.canonicalUrl?'warning':f.canonicalUrl&&f.canonicalUrl!==f.url?'info':f.canonicalUrl?'pass':'info',f.canonical&&!f.canonicalUrl?'medium':'none',{
      evidence:f.canonicalUrl||(f.canonical?s('Invalid canonical URL','URL canónica inválida'):t('Sin canonical declarado.')),
      action:s('Make sure the preferred URL matches the version you want search engines to consolidate.','Asegúrate de que la URL preferida sea la versión que quieres consolidar en buscadores.'),
      explanation:s('A canonical is a hint about the preferred version of duplicate or similar content. It is not a redirect.','La canonical es una señal de la versión preferida de contenido duplicado o similar. No es una redirección.'),
      impact:s('A different canonical may be intentional. Missing canonical markup is not an AI-specific failure. We do not fetch or verify the canonical destination in this check.','Una canonical distinta puede ser intencional. Su ausencia no es un fallo específico de IA. No solicitamos ni verificamos el destino canónico en esta prueba.'),
      steps:[s('Compare the analyzed URL with the canonical value shown here.','Compara la URL analizada con el valor canónico mostrado.'),s('If incorrect, update the SEO/canonical setting for this page. Do not force every page to point to the homepage.','Si es incorrecto, actualiza el ajuste SEO/canónico de esta página. No hagas que todas apunten a la portada.')],
      where:correctionLocation(f,'head',locale),verification:recheck,evidenceRows:fields('canonical'),documentation:docs.canonical,
    }),
    base('links',t('Enlaces internos extraíbles'),f.internalLinks?s('We found links to other pages','Encontramos enlaces hacia otras páginas'):s('Review links to your other pages','Revisa los enlaces a tus otras páginas'),'structure',f.internalLinks?'pass':'info',f.internalLinks?'none':'low',{
      evidence:t`${f.internalLinks} destinos internos únicos en el HTML analizado, excluyendo cabecera y navegación.`,
      action:s('Link to relevant pages with descriptive, real HTML links.','Enlaza páginas relacionadas con enlaces HTML reales y descriptivos.'),
      explanation:s('An <a href="…"> link provides a destination that tools can discover. A click handler without an href may not provide the same signal.','Un enlace <a href="…"> ofrece un destino que las herramientas pueden descubrir. Un evento de clic sin href puede no dar la misma señal.'),
      impact:s('This count covers links in the remaining document after navigation/header/footer removal. It is not a site-wide crawl, and more links are not automatically better.','Este conteo cubre enlaces del documento tras excluir navegación/cabecera/pie. No es un rastreo del sitio y más enlaces no son automáticamente mejores.'),
      steps:[s('Link naturally to related services, products or guides.','Enlaza de forma natural servicios, productos o guías relacionados.'),s('Ask your developer to use <a href> for navigation rather than only JavaScript click handlers.','Pide usar <a href> para navegación en lugar de depender solo de eventos JavaScript.')],
      where:correctionLocation(f,'body',locale),verification:recheck,evidenceRows:fields('links'),example:'<a href="/services">Explore our services</a>',documentation:docs.js,
    }),
    base('schema',t('Datos estructurados'),badSchema?s('Some structured data is not valid JSON','Hay datos estructurados con JSON inválido'):f.jsonLd.length?s('Structured data was detected','Detectamos datos estructurados'):s('Structured data is an optional improvement','Los datos estructurados son una mejora opcional'),'structure',badSchema?'warning':'info',badSchema?'medium':'none',{
      evidence:t`${f.jsonLd.length} bloques JSON-LD; ${f.jsonLd.filter(j=>!j.valid).length} con JSON inválido.`,
      action:badSchema?s('Correct the syntax of the affected blocks.','Corrige la sintaxis de los bloques afectados.'):s('If useful for your page type, describe real entities consistently with the visible content.','Si resulta útil para tu tipo de página, describe entidades reales de forma coherente con el contenido visible.'),
      explanation:s('JSON-LD can describe a product, organization or article in a structured way. We check JSON syntax and list declared types only.','JSON-LD puede describir un producto, organización o artículo de forma estructurada. Solo comprobamos la sintaxis JSON y listamos tipos declarados.'),
      impact:s('Valid JSON is not proof of a valid schema or eligibility for rich results. No special schema is required for Google AI features; absence is not a failure here.','Un JSON válido no prueba que el esquema sea correcto ni que tenga derecho a resultados enriquecidos. Google no exige un schema especial para sus funciones de IA; su ausencia no es un fallo aquí.'),
      steps:[s('Review the affected <script type="application/ld+json"> block and its location.','Revisa el bloque <script type="application/ld+json"> afectado y su ubicación.'),s('If syntax is invalid, correct quotes, commas and brackets in the generating template or plugin.','Si la sintaxis falla, corrige comillas, comas y llaves en la plantilla o plugin que lo genera.'),s('Validate the appropriate schema separately and ensure its claims match visible content.','Valida el esquema correspondiente por separado y comprueba que coincide con el contenido visible.')],
      where:correctionLocation(f,'head',locale),verification:recheck,evidenceRows:fields('schema'),documentation:docs.schema,
    }),
    base('search-access',s('Search crawler permissions','Permisos de rastreadores de búsqueda'),blocked.length?s('Some search crawlers are restricted','Algunos rastreadores de búsqueda están restringidos'):unknown?s('We could not verify crawler permissions','No pudimos verificar los permisos de rastreo'):s('No search-crawler restriction found for this path','Sin restricciones de búsqueda detectadas para esta ruta'),'access',blocked.length?'warning':unknown?'info':'pass',blocked.length?'high':unknown?'medium':'none',{
      evidence:blocked.length?blocked.map(a=>`${a.name}: ${a.evidence}`).join('\n'):unknown?s('robots.txt was not verifiable.','No se pudo verificar robots.txt.'):s('No matching Disallow was found for the checked search agents.','No encontramos Disallow aplicables a los agentes de búsqueda revisados.'),
      action:s('Choose which search agents you want to allow; keep training preferences separate.','Decide qué agentes de búsqueda quieres permitir; mantén separadas tus preferencias de entrenamiento.'),
      explanation:s('robots.txt declares path-specific crawling preferences. Search agents and training agents have different purposes.','robots.txt declara preferencias de rastreo por ruta. Los agentes de búsqueda y los de entrenamiento tienen finalidades distintas.'),
      impact:s('A restriction may limit discovery by the affected search agent. An Allow rule does not guarantee indexing or citations. Allowing training is not required by this audit.','Una restricción puede limitar el descubrimiento por ese agente de búsqueda. Una regla Allow no garantiza indexación ni citas. Esta auditoría no exige permitir entrenamiento.'),
      steps:[s('Open the Crawlers tab and identify the exact restricted agent and rule.','Abre Rastreadores e identifica el agente y la regla exacta restringida.'),s('Ask the site owner whether the restriction is intentional. If not, change only that agent/path rule. Do not replace the whole robots.txt with a generic example.','Consulta al propietario si la restricción es intencional. Si no, cambia solo esa regla de agente/ruta. No sustituyas todo robots.txt por un ejemplo genérico.'),s('If rules permit access but crawling still fails, review CDN/firewall settings and verified crawler logs.','Si las reglas permiten acceso y el rastreo falla, revisa CDN/firewall y logs de rastreadores verificados.')],
      where:correctionLocation(f,'robots',locale),verification:recheck,evidenceRows:[{location:f.robotsUrl,value:f.robotsExcerpt||s('No verifiable robots body.','Sin cuerpo de robots verificable.')}],documentation:docs.robots,
    }),
    base('images',s('Image text alternatives','Alternativas textuales de imágenes'),missingAlt.length?s('Review images without an alt attribute','Revisa imágenes sin atributo alt'):s('Image alt attributes were checked','Revisamos los atributos alt de las imágenes'),'content',missingAlt.length?'info':'pass',missingAlt.length?'low':'none',{
      evidence:s(`${f.images.length} images checked; ${missingAlt.length} without an alt attribute.`,`${f.images.length} imágenes revisadas; ${missingAlt.length} sin atributo alt.`),
      action:s('Describe meaningful images; keep alt="" for decorative images.','Describe imágenes informativas; conserva alt="" en imágenes decorativas.'),
      explanation:s('Alt text offers a textual alternative for people and tools that cannot use an image. An empty alt can be correct for a decorative image.','El texto alt ofrece una alternativa para personas y herramientas que no usan la imagen. Un alt vacío puede ser correcto en imágenes decorativas.'),
      impact:s('We do not inspect image pixels or judge whether an image is decorative. Missing alt is a review opportunity, not proof that a vision-capable AI cannot interpret it.','No inspeccionamos los píxeles ni decidimos si una imagen es decorativa. La ausencia de alt es una oportunidad de revisión, no prueba de que una IA con visión no la interprete.'),
      steps:[s('Review each image URL shown and decide whether it adds meaningful information.','Revisa cada URL de imagen mostrada y decide si aporta información relevante.'),s('Add concise alt text for informative images in your media editor/template. Put essential prices or service information in visible HTML text too.','Añade alt breve a imágenes informativas en el editor multimedia/plantilla. Incluye precios o información esencial también como texto HTML visible.')],
      where:correctionLocation(f,'body',locale),verification:recheck,evidenceRows:fields('images'),example:'<img src="product.jpg" alt="Describe this informative image accurately">\n<img src="decoration.svg" alt="">',documentation:docs.images,
    }),
  ];
}
export function reportFromFacts(facts: AuditFacts, locale: Locale) {
  const findings = buildFindings(facts,locale);
  const actions = findings.filter(f=>f.state!=='pass'&&f.priority!=='none');
  return {
    url:facts.url,requestedUrl:facts.requestedUrl,title:facts.title||new URL(facts.url).hostname,
    analyzedAt:facts.analyzedAt,status:findings.some(f=>f.state==='warning')?'limitations':'readable',
    words:facts.words,internalLinks:facts.internalLinks,findings,agents:facts.agents,robotsUrl:facts.robotsUrl,excerpt:facts.excerpt,
    scope:translator(locale)('Una URL · HTML inicial · sin ejecutar JavaScript · sin comprobar indexación ni citas reales'),
    overview:{passed:findings.filter(f=>f.state==='pass').length,actions:actions.length,highPriority:actions.filter(f=>f.priority==='high').length,checks:findings.length},
    metrics:{htmlBytes:facts.htmlBytes,elapsedMs:facts.elapsedMs,headings:facts.headings.length,images:facts.images.length,missingAlt:facts.images.filter(i=>i.alt===null).length,jsonLd:facts.jsonLd.length},
    platform:facts.platform,resources:facts.resources,
  };
}
export type Report = ReturnType<typeof reportFromFacts>;
