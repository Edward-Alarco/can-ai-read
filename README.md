# Can AI Read

A minimal website checker that inspects a public URL for observable access barriers, crawler permissions and extractable HTML content. Built with **Astro, Tailwind CSS and TypeScript**.

## Features

- English by default; Spanish when it is the browser's primary language preference.
- Persistent EN/ES selector, with manual choice taking priority over detection.
- HTTP status and redirects, initial HTML text, headings, internal links and canonical URL.
- Meta robots and X-Robots-Tag inspection; JSON-LD syntax checks.
- Separate robots.txt rules for search and training agents from OpenAI, Anthropic and Google.
- Prioritized expandable findings: plain-language explanations, source evidence, HTML line numbers, correction guidance, code examples, verification steps and official documentation.
- Action filters, a copyable action plan, reading view and JSON export.
- Optional, explicitly requested mobile screenshot from Google PageSpeed Insights; service availability and quota apply.
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

Import this repository in Vercel and select Astro. Use Node.js 22.x, install with `npm ci`, and build with `npm run build`. The included `@astrojs/vercel` adapter provides the Node runtime required by `/api/analyze`. No environment variables are required for the HTML diagnostic. `PAGESPEED_API_KEY` is optional for the user-triggered Google screenshot preview; set it only server-side.

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

Type checks, 26 automated tests and the production build pass. Tests cover URL validation, robots rules, controlled HTML reports, language selection and API error localization. External website connectivity still needs verification from a local machine or Vercel: the development environment could not complete the external connection test. The improved diagnostic has been exercised in the desktop preview using controlled demo data. Real external screenshot delivery has not been verified in this environment. No real mobile-browser verification has been completed.

## Reference documentation

- [OpenAI crawlers](https://developers.openai.com/api/docs/bots)
- [Anthropic crawlers](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)
- [Google Search AI features](https://developers.google.com/search/docs/appearance/ai-features)

## Diagnostic interpretation

The report presents ten HTML-based checks with explicit statuses and priorities. Only actionable findings count toward recommended actions. Optional schema markup and intentional model-training restrictions do not produce artificial failures. A low extracted-word count is a heuristic for review, not a mandatory word count or proof of unreadability. Generic H1 labels and images missing alt are opportunities for manual review.

Evidence snippets come from the received HTML and include parser-provided line numbers where available. These lines are **not repository source lines**. The checker cannot inspect a scanned site's private files. CMS/framework hints come from public HTML; correction locations are labeled as common, unverified suggestions. Published script/CSS URLs are listed as observed resources and are not fetched or individually audited.

No overall AI-understanding or citation probability score is generated. Metrics include HTML bytes, analysis duration, heading/image counts, words and links; analysis duration is not a page-speed benchmark.

## Optional real screenshot

Open Visual preview and click Request preview from Google. The interface explains that the URL will be shared with Google. The server requires `consent: true`, revalidates the public target with the existing pinned-DNS client, then asks the fixed Google PageSpeed API endpoint for a mobile Lighthouse run. If Google includes a supported final-screenshot raster, it is displayed with its source and final URL. No screenshot is fabricated, and the preview is separate from the HTML diagnostic. Demo URLs cannot trigger a request.

PageSpeed can be queried without a key, but quotas may prevent delivery. For repeated usage, set `PAGESPEED_API_KEY` in your server environment after enabling the PageSpeed Insights API. Never use a PUBLIC_ variable for this key. A response may omit a usable screenshot. There is no guaranteed full-page capture, browser-agent simulation or performance score. The preview fails independently of the report and is not stored in a database. Google may process the submitted public URL according to its service policies.

The Vercel adapter permits up to 60 seconds (subject to your plan). Core diagnostic and preview endpoints still need deployment-level rate limiting/abuse controls before public launch. Screenshot requests can be expensive and use provider quota; the MVP has no durable distributed rate limiter. No headless browser or new database is required for this preview integration.
