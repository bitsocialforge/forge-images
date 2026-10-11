# Forge Images

Free, permanent media hosting by [Bitsocial Forge](https://bitsocialforge.com), and the upload provider behind
[5chan](https://5chan.app). Anonymous uploads, no paid tiers, no expiry.

This repository is the public surface of the service:

| Path | What |
|---|---|
| `site/` | The website at `images.bitsocialforge.com`: direct uploads, FAQ, legal pages, report form |
| `packages/client/` | [`@bitsocialforge/forge-images-client`](packages/client/README.md), a dependency-free upload and report client |
| `docs/API.md` | The [API contract](docs/API.md) for integrators |

The hosted API server and moderation pipeline are private.

## Website

React 19 + TypeScript, built with Vite into static files: no server runtime.

| Path | What |
|---|---|
| `site/*.html` | One HTML shell per page (`/`, `/faq`, `/legal`, `/report`) |
| `site/src/pages/`, `site/src/components/` | The pages and their shared layout |
| `site/src/lib/` | Upload, Turnstile, and report logic, and the API endpoints for each environment (`config.ts`) |
| `site/src/entries/`, `site/src/entry-server.tsx` | Client hydration entries and the Node renderer used for prerendering |
| `site/src/styles/site.css` | All styles |
| `site/public/` | Copied as-is: `favicon.svg`, `.well-known/security.txt` |
| `vite.config.ts`, `scripts/prerender.mjs` | Build config, local CSP headers, and the prerender step |

`corepack yarn build:site` runs `vite build` and then prerenders every page into `dist/<page>.html`, so the text
(FAQ and legal included) is in the HTML without JavaScript; the client hydrates it. The output has no inline
scripts or styles: `vercel.json` sets a Content Security Policy without `'unsafe-inline'`, plus the other security
headers.

Deploy: the Vercel project `forge-images` builds `master` on every push (`corepack yarn install --immutable`, then
`corepack yarn build:site`, serving `dist/` with clean URLs) and serves the custom domain
`images.bitsocialforge.com` (DNS-only CNAME to Vercel), with Web Analytics on through `@vercel/analytics`. The
Turnstile widget must list that hostname. When the legal text changes, update the effective date at the top of
`site/src/pages/legal-page.tsx`.

Local development:

```bash
corepack enable
corepack yarn install
corepack yarn start
```

`yarn start` runs the Vite dev server (React Refresh, and the Agentation annotation toolbar, which never ships in
production builds) at `https://forge-images.localhost` (portless; on another branch,
`https://<branch>.forge-images.localhost`). The site talks to a local API at `https://api.<site host>`, which
`yarn start` in the server repository provides. `PORTLESS=0` serves on `http://localhost:8080` with the API
expected at `http://127.0.0.1:3917`; `BROWSER=none` skips opening the browser. Locally the site uses Cloudflare's
always-pass Turnstile test key.

Both the dev server and the preview send the `vercel.json` headers, with the CSP's API and media origins pointed
at the local API. The dev server adds two sources that Vite needs and production never gets: a per-run nonce in
`script-src` for the React Refresh preamble, and `'unsafe-inline'` in `style-src` for the styles Vite's client and
Agentation inject.

Production build under the real CSP:

```bash
corepack yarn build:site
corepack yarn preview   # http://127.0.0.1:4173, API expected at http://127.0.0.1:3917
```

Checks:

```bash
corepack yarn typecheck
corepack yarn lint
corepack yarn test
corepack yarn format:check
corepack yarn build      # the site and the client package
```

## Client package

```bash
corepack yarn build:client
```

## License

- `packages/client`: MIT ([LICENSE](packages/client/LICENSE)).
- Everything else: GPL-3.0-or-later ([LICENSE](LICENSE)).

The Forge Images and Bitsocial Forge names and logos are trademarks of Bitsocial Forge Inc. and are not licensed
for reuse. The wordmark outlines Exo by Natanael Gama (SIL Open Font License 1.1).
