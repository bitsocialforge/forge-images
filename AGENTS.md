# AGENTS.md

Forge Images is a free, permanent media host run by Bitsocial Forge Inc. This repository holds its public
surface: the website served at `images.bitsocialforge.com` (`site/`), the upload client package
(`packages/client`), and the API contract (`docs/API.md`). The API server, moderation worker, operator CLI,
infrastructure, and policy documents live in the private `bitsocialforge/forge-images-server` repository and
must not be copied here.

## Rules

- Use Corepack-managed Yarn 4 (`corepack yarn`), never npm. Pin exact versions and keep `yarn.lock` in sync.
- Keep the site plain static HTML/CSS/ES modules with no build step. It deploys to Cloudflare Pages from `site/`;
  `site/_headers` sets its CSP. Match the bitsocialforge.com look: square edges, 1px borders, the ember palette,
  no external fonts or trackers.
- Site copy (FAQ, legal, upload limits) must match the server's actual behavior. Check the server repo before
  changing a claim, and update `docs/API.md` when the contract changes.
- Keep `packages/client` dependency-free and in sync with `docs/API.md`.
- Never commit secrets, server addresses, moderation thresholds, or operator procedures.

## Commands

- `corepack yarn start` serves the site locally under its production CSP (pair it with `yarn start` in the
  server repo for a local API).
- `corepack yarn test`, `corepack yarn typecheck`, `corepack yarn build`, `corepack yarn format:check`.
