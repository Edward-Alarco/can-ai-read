import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as request } from 'undici';

export function isPublicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
export function normalizeUrl(input: string): URL {
  if (input.length > 2048) throw new Error('La URL es demasiado larga.');
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('Usa una URL pública HTTP o HTTPS sin credenciales ni puertos especiales.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) || (isIP(host) && !isPublicAddress(host))) throw new Error('Solo podemos analizar sitios públicos de Internet.');
  url.hash = '';
  return url;
}

export type PageResponse = { status: number; url: string; body: string; headers: Record<string, string>; redirects: number };
export async function safeFetch(input: string, signal: AbortSignal, limit = 1_500_000): Promise<PageResponse> {
  let url = normalizeUrl(input);
  for (let redirects = 0; redirects <= 4; redirects++) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await lookup(host, { all: true });
    if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) throw new Error('El destino no corresponde a una dirección pública permitida.');
    const chosen = addresses[0];
    // Pin the validated address: DNS cannot change between validation and connection.
    const dispatcher = new Agent({ connect: { autoSelectFamily: false, lookup: (_hostname, _options, callback) => callback(null, chosen.address, chosen.family) } });
    try {
      const response = await request(url, { dispatcher, redirect: 'manual', signal, headers: { 'user-agent': 'CanAIRead/0.1 (+website-readability-audit)', accept: 'text/html,text/plain,application/xml;q=0.8', 'accept-language': 'es,en;q=0.8' } });
      if ([301,302,303,307,308].includes(response.status) && response.headers.get('location')) {
        await response.body?.cancel();
        url = normalizeUrl(new URL(response.headers.get('location')!, url).href);
        continue;
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new Error('El contenido excede el límite de análisis.'); }
        chunks.push(value);
      }
      return { status: response.status, url: url.href, body: Buffer.concat(chunks).toString('utf8'), headers: Object.fromEntries(response.headers.entries()), redirects };
    } finally { await dispatcher.close(); }
  }
  throw new Error('La página tiene demasiadas redirecciones.');
}
