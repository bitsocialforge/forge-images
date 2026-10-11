# AGENTS.md

Forge Images is a free, permanent media host run by Bitsocial Forge Inc. This repository holds its public
surface: the website served at `images.bitsocialforge.com` (`site/`), the upload client package
(`packages/client`), and the API contract (`docs/API.md`). The API server, moderation worker, operator CLI,
infrastructure, and policy documents live in the private `bitsocialforge/forge-images-server` repository and
must not be copied here.

## Rules

- Use Corepack-managed Yarn 4 (`corepack yarn`), never npm. Pin exact versions and keep `yarn.lock` in sync.
- The site is React 19 + TypeScript built with Vite (`site/`, config in `vite.config.ts`). Every page is
  prerendered to static HTML at build time (`scripts/prerender.mjs`) and hydrated on the client, so its text works
  without JavaScript; keep page components free of browser globals at import and render time. Vercel builds
  `dist/` from `master`; `vercel.json` sets its CSP and headers. The output must have no inline scripts, styles,
  or `data:` URLs, because the CSP allows none. Agentation is dev-only (`site/src/lib/dev-tools.ts`) and must never
  reach the production bundle.
- Match the bitsocialforge.com look: square edges, 1px borders, the ember palette, no external fonts or
  third-party trackers. All styles live in `site/src/styles/site.css`. Vercel Web Analytics (first-party,
  cookieless, `@vercel/analytics`) is the only analytics, and the legal page (`site/src/pages/legal-page.tsx`)
  discloses it.
- Site copy (FAQ, legal, upload limits) must match the server's actual behavior. Check the server repo before
  changing a claim, and update `docs/API.md` when the contract changes.
- Keep `packages/client` dependency-free and in sync with `docs/API.md`.
- Never commit secrets, server addresses, moderation thresholds, or operator procedures.

## Commands

- `corepack yarn start` runs the Vite dev server under the production CSP (pair it with `yarn start` in the server
  repo for a local API). `corepack yarn build:site && corepack yarn preview` serves the production build with the
  `vercel.json` headers.
- `corepack yarn test`, `corepack yarn typecheck`, `corepack yarn lint`, `corepack yarn build`,
  `corepack yarn format:check`.
