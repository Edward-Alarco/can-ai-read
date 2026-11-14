import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

const PLACEHOLDER_SITE_URL = 'https://canaireadyou.com';

function resolveSiteUrl() {
  const explicit = process.env.PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProduction) {
    return (vercelProduction.startsWith('https://') || vercelProduction.startsWith('http://')
      ? vercelProduction
      : `https://${vercelProduction}`).replace(/\/$/, '');
  }
  return PLACEHOLDER_SITE_URL;
}

export default defineConfig({
  site: resolveSiteUrl(),
  devToolbar: { enabled: false },
  output: 'server',
  adapter: vercel({ maxDuration: 60 }),
  vite: {
    plugins: [tailwindcss()],
    // jspdf is only reached through a dynamic import (the "Download report" button). Pre-bundle it
    // at dev-server start so Vite does not re-optimize on the first click and answer the stale
    // chunk with "504 Outdated Optimize Dep" (which made the PDF fail in the browser).
    optimizeDeps: { include: ['jspdf'] },
    ssr: { external: ['@sparticuz/chromium', 'puppeteer-core'] },
  },
});
