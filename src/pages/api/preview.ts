import type { APIRoute } from 'astro';
import { resolveLocale } from '../../lib/i18n';
import { copy } from '../../lib/diagnostics';
import { normalizeUrl, safeFetch } from '../../lib/safe-fetch';
import { extractVisualPreview } from '../../lib/visual-preview';
export const prerender=false;
export const POST: APIRoute=async({request,cookies})=>{
  let locale=resolveLocale(request.headers.get('accept-language'),cookies.get('language')?.value);
  const s=(en:string,es:string)=>copy(locale,en,es);
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Content-Language':locale}});
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:s('Origin not allowed.','Origen no permitido.')},403);
  if(!request.headers.get('content-type')?.includes('application/json'))return reply({error:s('Use a JSON request.','Usa una solicitud JSON.')},415);
  try{
    const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
    if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return reply({error:s('Request too large.','Solicitud demasiado grande.')},413);}chunks.push(value);}
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(body?.language==='en'||body?.language==='es')locale=body.language;
    if(body?.consent!==true)return reply({error:s('Confirm sharing this public URL with Google before requesting a preview.','Confirma el envío de esta URL pública a Google antes de solicitar la vista previa.')},400);
    if(typeof body.url!=='string')return reply({error:s('Enter a public URL.','Introduce una URL pública.')},400);
    const normalized=normalizeUrl(body.url);
    // Revalidate the destination and every redirect using the same pinned-DNS client as the HTML audit.
    const page=await safeFetch(normalized.href,AbortSignal.timeout(10_000));
    if(page.status<200||page.status>=300)return reply({error:s('The page could not be retrieved for preview.','No se pudo obtener la página para la vista previa.')},422);
    const endpoint=new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    endpoint.searchParams.set('url',page.url);endpoint.searchParams.set('strategy','mobile');endpoint.searchParams.set('category','performance');
    const key=import.meta.env.PAGESPEED_API_KEY||process.env.PAGESPEED_API_KEY;
    if(key)endpoint.searchParams.set('key',key);
    const response=await fetch(endpoint,{redirect:'error',signal:AbortSignal.timeout(40_000)});
    if(!response.ok){await response.body?.cancel();return reply({error:s('Google could not provide a preview. Its service or quota may be unavailable. Your HTML diagnostic is still valid.','Google no pudo proporcionar la vista previa. Su servicio o cuota pueden no estar disponibles. Tu diagnóstico HTML sigue siendo válido.')},502);}
    const resultReader=response.body?.getReader(),parts:Uint8Array[]=[];let bytes=0;
    if(resultReader)while(true){const {done,value}=await resultReader.read();if(done)break;bytes+=value.byteLength;if(bytes>8_000_000){await resultReader.cancel();throw new Error('Preview response too large');}parts.push(value);}
    const preview=extractVisualPreview(JSON.parse(Buffer.concat(parts).toString('utf8')));
    if(!preview)return reply({error:s('Google returned no usable screenshot for this page. No image was generated or substituted.','Google no devolvió una captura utilizable para esta página. No se generó ni sustituyó la imagen.')},502);
    return reply(preview);
  }catch{return reply({error:s('Preview unavailable or timed out. You can keep using the HTML diagnostic.','Vista previa no disponible o tiempo agotado. Puedes seguir usando el diagnóstico HTML.')},422);}
};
