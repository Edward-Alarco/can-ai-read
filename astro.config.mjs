import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ devToolbar: { enabled: false }, output: 'server', adapter: vercel(), vite: { plugins: [tailwindcss()] } });
