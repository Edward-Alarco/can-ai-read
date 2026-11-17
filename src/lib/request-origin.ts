function firstHeaderValue(value: string | null): string {
  return value?.split(',')[0]?.trim().toLowerCase() ?? '';
}

export function isAllowedRequestOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  let originUrl: URL;
  try { originUrl = new URL(origin); } catch { return false; }
  if (!['http:', 'https:'].includes(originUrl.protocol)) return false;

  const requestUrl = new URL(request.url);
  const allowedHosts = new Set([
    requestUrl.host.toLowerCase(),
    firstHeaderValue(request.headers.get('host')),
    firstHeaderValue(request.headers.get('x-forwarded-host')),
  ].filter(Boolean));

  return allowedHosts.has(originUrl.host.toLowerCase());
}
