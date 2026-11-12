export type VisualPreview = { dataUrl: string; finalUrl: string; capturedAt: string; source: 'Google PageSpeed Insights'; strategy: 'mobile' };
export function extractVisualPreview(result: unknown): VisualPreview | null {
  const data=result as {lighthouseResult?: {finalUrl?: unknown;fetchTime?:unknown;audits?:Record<string,{details?:{data?:unknown}}>}}|null;
  const lh=data?.lighthouseResult;
  const image=lh?.audits?.['final-screenshot']?.details?.data;
  if(typeof image!=='string'||image.length>2_800_000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))return null;
  if(typeof lh?.finalUrl!=='string')return null;
  try {const url=new URL(lh.finalUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;}catch{return null;}
  const capturedAt=typeof lh.fetchTime==='string'&&Number.isFinite(Date.parse(lh.fetchTime))?lh.fetchTime:'';
  return {dataUrl:image,finalUrl:lh.finalUrl,capturedAt,source:'Google PageSpeed Insights',strategy:'mobile'};
}
