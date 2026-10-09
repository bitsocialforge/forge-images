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

Plain static HTML, CSS and ES modules with no build step. `site/_headers` sets the Content Security Policy and
security headers on Cloudflare Pages.

Deploy: create a Cloudflare Pages project from this repository with no build command and `site` as the output
directory, then attach the custom domain `images.bitsocialforge.com`. The Turnstile widget must list that
hostname. Before the public launch, set the effective date on `site/legal.html` (`[[EFFECTIVE_DATE]]`).

Local preview:

```bash
corepack enable
corepack yarn install
corepack yarn start
```

The site opens at `https://forge-images.localhost` (portless) and talks to a local API at
`https://api.forge-images.localhost`, which `yarn start` in the server repository provides. `PORTLESS=0` serves on
`http://localhost:8080` with the API expected at `http://127.0.0.1:3917`. Locally the site uses Cloudflare's
always-pass Turnstile test key.

## Client package

```bash
corepack yarn test
corepack yarn typecheck
corepack yarn build
```

## License

- `packages/client`: MIT ([LICENSE](packages/client/LICENSE)).
- Everything else: GPL-3.0-or-later ([LICENSE](LICENSE)).

The Forge Images and Bitsocial Forge names and logos are trademarks of Bitsocial Forge Inc. and are not licensed
for reuse. The wordmark outlines Exo by Natanael Gama (SIL Open Font License 1.1).
