# Can AI Read

A minimal website checker that inspects a public URL for observable access barriers, crawler permissions and extractable HTML content. Built with **Astro, Tailwind CSS and TypeScript**.

## Features

- English by default; Spanish when it is the browser's primary language preference.
- Persistent EN/ES selector, with manual choice taking priority over detection.
- HTTP status and redirects, initial HTML text, headings, internal links and canonical URL.
- Meta robots and X-Robots-Tag inspection; JSON-LD syntax checks.
- Separate robots.txt rules for search and training agents from OpenAI, Anthropic and Google.
- Findings with evidence and practical recommendations, a reading view and JSON export.
- Clearly labeled sample report. No database or AI API keys required.

## Development

Use **Node.js 22.12+ within the 22.x LTS release line**.

```sh
npm ci
npm run dev
```

Open http://localhost:4321 (or the address printed by Astro).

```sh
npm run check
npm test
npm run build
```

On Windows, the project can live at `C:\Users\edwar\Desktop\Projects\can-ai-read`.

## Vercel

Import this repository in Vercel and select Astro. Use Node.js 22.x, install with `npm ci`, and build with `npm run build`. The included `@astrojs/vercel` adapter provides the Node runtime required by `/api/analyze`. No environment variables are required for this MVP.

Deployment has not been performed. Before allowing public traffic, configure hosting/WAF rate limits and abuse controls. This MVP does not implement distributed request quotas; Origin checks do not replace rate limiting.

## Scope and limitations

The checker inspects **one URL and its initial HTML**. It does not execute JavaScript, run OCR, crawl the whole domain, verify indexing or measure actual AI citations. Its requests identify as CanAIRead, not as an official provider bot. A successful request does not prove that another provider receives the same response.

Robots parsing covers common agent groups, Allow/Disallow rules, wildcards and end anchors. Full RFC 9309 normalization of encoded and Unicode paths is not implemented. JSON-LD checks validate JSON syntax, not schema semantics. Missing `llms.txt` is not penalized, and restricting model training is treated as an owner preference.

Requests reject non-public IP addresses, credentials and special ports. Redirect destinations are validated and resolved public IPs are pinned to connections. Responses and request bodies have size limits, and outbound requests have timeouts. DNS resolution depends on the system resolver timeout. Extracted content is displayed as text, not executed as HTML.

## Language behavior

`Accept-Language` determines the primary language preference. Spanish variants such as `es-PE` and `es-ES` select Spanish; other, missing or invalid preferences select English. An explicit EN/ES choice is saved in a `language` cookie for one year. Changing language reloads the page and clears the current report, so download it first if needed.

Interface copy, metadata, report explanations and errors are localized. Original page titles, descriptions, headings and extracted text are preserved. Responses set language and cache headers to avoid sharing visitor-specific language selections. Translations live in `src/lib/i18n.ts`.

## Roadmap

- Final domain, branding and Open Graph metadata/image.
- Rendered DOM comparison and standards-complete robots parsing.
- Optional Supabase Auth and Postgres for accounts, history and quotas.
- Site-wide sampling and monitoring after validating demand.

Supabase is not integrated yet. Reports are not persisted in a database; hosting providers may retain technical logs. Only submit public URLs without sensitive data.

## Validation

Type checks, 16 automated tests and the production build pass. Tests cover URL validation, robots rules, controlled HTML reports, language selection and API error localization. External website connectivity still needs verification from a local machine or Vercel: the development environment could not complete the external connection test. The latest visual review was blocked by the preview browser policy; no real mobile-browser verification has been completed.

## Reference documentation

- [OpenAI crawlers](https://developers.openai.com/api/docs/bots)
- [Anthropic crawlers](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
- [Google Search AI features](https://developers.google.com/search/docs/appearance/ai-features)
