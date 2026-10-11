import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";

const siteRoot = fileURLToPath(new URL("./site/", import.meta.url));
// Each page is an HTML file in site/; scripts/prerender.mjs fills its #root at build time.
const pages = ["index", "faq", "legal", "report"];

// The site imports the client package's source, so neither the dev server nor the build needs its dist/.
// tsconfig.json and vitest.config.ts map the same path.
const clientPackageAlias = {
  "@bitsocialforge/forge-images-client": fileURLToPath(new URL("./packages/client/src/index.ts", import.meta.url)),
};

// The CSP's production API and media origins, swapped for the local API (which also serves uploaded media under
// DEV_SERVE) because a page opened locally talks to it (site/src/lib/config.ts). scripts/start.mjs sets
// SITE_API_ORIGIN; the default is the address config.ts uses on localhost.
const productionOrigins = ["https://img-api.bitsocialforge.com", "https://forgeimg.net"];
const localApiOrigin = process.env.SITE_API_ORIGIN || "http://127.0.0.1:3917";

interface HeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

/** `headers` from vercel.json, re-read per request so edits apply without a restart. */
function readHeaderRules(): HeaderRule[] {
  const config = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8")) as {
    headers?: HeaderRule[];
  };
  return config.headers ?? [];
}

function localCsp(policy: string, devNonce: string | undefined): string {
  return policy
    .split(";")
    .map((directive) => {
      const [name = "", ...sources] = directive.trim().split(/\s+/);
      const local = sources.map((source) => (productionOrigins.includes(source) ? localApiOrigin : source));
      // Dev server only, never production: plugin-react injects the React Refresh preamble as an inline module
      // script (Vite tags it with this run's nonce), and Vite's dev client and Agentation inject <style> elements.
      if (devNonce && name === "script-src") local.push(`'nonce-${devNonce}'`);
      if (devNonce && name === "style-src") local.push("'unsafe-inline'");
      return [name, ...new Set(local)].join(" ");
    })
    .join("; ");
}

/**
 * Serves the dev server and `vite preview` with the vercel.json headers, so the local site runs under the
 * production CSP (see localCsp for the origin swap and the dev-only additions). The preview also mirrors
 * Vercel's cleanUrls redirect and stubs the Web Analytics script, which Vercel injects in production.
 */
function vercelHeaders({ devNonce, preview }: { devNonce?: string; preview: boolean }): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    for (const rule of readHeaderRules()) {
      if (!new RegExp(`^${rule.source}$`).test(url.pathname)) continue;
      for (const { key, value } of rule.headers) {
        res.setHeader(key, key.toLowerCase() === "content-security-policy" ? localCsp(value, devNonce) : value);
      }
    }
    if (preview) {
      const clean = /^(.*\/)([^/]+)\.html$/.exec(url.pathname);
      if (clean) {
        res.writeHead(308, { Location: `${clean[1]}${clean[2] === "index" ? "" : clean[2]}${url.search}` }).end();
        return;
      }
      if (url.pathname.startsWith("/_vercel/insights/")) {
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }).end();
        return;
      }
    }
    next();
  };
  return {
    name: "forge-images:vercel-headers",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}

/** Dev server: prerenders each page per request, so development hydrates the same markup as production. */
function prerenderInDev(): Plugin {
  return {
    name: "forge-images:dev-prerender",
    apply: "serve",
    async transformIndexHtml(html, { server, filename }) {
      if (!server) return html;
      const { APP_PLACEHOLDER, renderPage } = (await server.ssrLoadModule(
        "/src/entry-server.tsx",
      )) as typeof import("./site/src/entry-server");
      // A replacer function, so `$` sequences in page text are not treated as replacement patterns.
      return html.replace(APP_PLACEHOLDER, () => renderPage(basename(filename, ".html")));
    },
  };
}

export default defineConfig(({ command, isPreview, isSsrBuild }) => {
  const devNonce = command === "serve" && !isPreview ? randomBytes(18).toString("base64") : undefined;
  return {
    root: siteRoot,
    appType: "mpa",
    plugins: [react(), vercelHeaders({ devNonce, preview: Boolean(isPreview) }), prerenderInDev()],
    resolve: { alias: clientPackageAlias },
    html: devNonce ? { cspNonce: devNonce } : undefined,
    build: {
      outDir: "../dist",
      emptyOutDir: true,
      // The CSP allows no data: URLs, so every asset must be a file.
      assetsInlineLimit: 0,
      rolldownOptions: isSsrBuild ? undefined : { input: pages.map((page) => `${siteRoot}${page}.html`) },
    },
    preview: { host: "127.0.0.1", port: 4173 },
  };
});
