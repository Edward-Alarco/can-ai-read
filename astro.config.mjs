import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// TODO: replace this placeholder with the final domain once it is confirmed.
const PLACEHOLDER_SITE_URL = 'https://canairead.com';

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
  vite: { plugins: [tailwindcss()], ssr: { external: ['@sparticuz/chromium', 'puppeteer-core'] } },
});
