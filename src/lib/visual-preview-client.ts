import { copy } from './diagnostics';
import type { Locale } from './i18n';
import type { VisualPreview } from './visual-preview';
let generation=0;
let controller:AbortController|undefined;
export function resetVisualPreview(url:string,demo:boolean,locale:Locale){
  generation++;controller?.abort();
  const version=generation,s=(en:string,es:string)=>copy(locale,en,es);
  const button=document.getElementById('visual-preview-button')as HTMLButtonElement;
  const message=document.getElementById('visual-preview-message')!;
  const figure=document.getElementById('visual-preview-figure')!;
  const img=document.getElementById('visual-preview-image')as HTMLImageElement;
  figure.hidden=true;button.removeAttribute('aria-busy');img.removeAttribute('src');button.disabled=demo;
  message.textContent=demo?s('Preview is disabled for fictional demo URLs. Analyze a public page first.','La vista previa está desactivada para URLs ficticias de la demo. Analiza primero una página pública.'):'';
  button.onclick=async()=>{
    if(button.disabled)return;
    button.disabled=true;button.setAttribute('aria-busy','true');message.textContent=s('Requesting the screenshot from Google…','Solicitando la captura a Google…');
    controller=new AbortController();const activeController=controller;const timer=setTimeout(()=>activeController.abort(),55_000);
    try{
      const response=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,consent:true,language:locale}),signal:activeController.signal});
      const data:VisualPreview&{error?:string}=await response.json();
      if(version!==generation)return;
      if(!response.ok)throw new Error(data.error||s('Preview unavailable.','Vista previa no disponible.'));
      if(!/^data:image\/(jpeg|png|webp);base64,/.test(data.dataUrl))throw new Error(s('Invalid preview format.','Formato de vista previa inválido.'));
      img.onload=()=>{if(version===generation){figure.hidden=false;message.textContent=s('Real screenshot returned by Google. This is not a simulation of an AI crawler’s view.','Captura real devuelta por Google. No simula lo que ve un rastreador de IA.');}};
      img.onerror=()=>{if(version===generation){figure.hidden=true;message.textContent=s('The screenshot could not be displayed.','No se pudo mostrar la captura.');}};
      img.src=data.dataUrl;
      document.getElementById('visual-preview-caption')!.textContent=`${data.source} · mobile · ${data.finalUrl}${data.capturedAt?' · '+new Date(data.capturedAt).toLocaleString(locale):''}`;
    }catch(error){if(version===generation)message.textContent=error instanceof Error&&error.name!=='AbortError'?error.message:s('Preview timed out or was cancelled. The HTML report is unaffected.','La vista previa agotó el tiempo o fue cancelada. El informe HTML no cambia.');}
    finally{clearTimeout(timer);if(version===generation){button.disabled=false;button.removeAttribute('aria-busy');}}
  };
}
