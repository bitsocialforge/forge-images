// Serves site/ locally the way Vercel serves images.bitsocialforge.com: extensionless URLs resolve to
// .html files (cleanUrls) and the headers in vercel.json apply, so the local site runs under the production CSP.
// The CSP's API and media origins are swapped for the local API (SITE_API_ORIGIN), which also serves
// uploaded media under DEV_SERVE. Started by scripts/start.mjs (`yarn start`).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../site", import.meta.url));
const vercelConfig = fileURLToPath(new URL("../vercel.json", import.meta.url));
const apiOrigin = process.env.SITE_API_ORIGIN || "http://127.0.0.1:3917";
const productionOrigins = ["https://img-api.bitsocialforge.com", "https://forgeimg.net"];

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

// `headers` from vercel.json; each `source` is matched as an anchored regular expression, which covers
// the `/(.*)` catch-all used there. Re-read per request so edits apply without a restart.
async function getHeaderRules() {
  const { headers = [] } = JSON.parse(await readFile(vercelConfig, "utf8"));
  return headers.map(({ source, headers: pairs }) => ({
    regExp: new RegExp(`^${source}$`),
    headers: pairs.map(({ key, value }) => {
      for (const origin of productionOrigins) value = value.replaceAll(origin, apiOrigin);
      return [key, value];
    }),
  }));
}

async function findFile(pathname) {
  const candidates = pathname.endsWith("/")
    ? [`${pathname}index.html`]
    : [pathname, `${pathname}.html`, `${pathname}/index.html`];
  for (const candidate of candidates) {
    const filePath = join(root, candidate);
    if (!filePath.startsWith(root + sep)) return null;
    if ((await stat(filePath).catch(() => null))?.isFile()) return filePath;
  }
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }

  try {
    for (const rule of await getHeaderRules()) {
      if (rule.regExp.test(pathname)) {
        for (const [name, value] of rule.headers) res.setHeader(name, value);
      }
    }
    res.setHeader("Cache-Control", "no-cache");

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }

    // Vercel injects the Web Analytics script in production; locally it is an empty module.
    if (pathname.startsWith("/_vercel/insights/")) {
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }).end();
      return;
    }
    const filePath = await findFile(pathname);
    if (!filePath) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found\n");
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      "Content-Length": body.length,
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () => {
  console.log(`Serving site/ on http://${host}:${port} (API ${apiOrigin})`);
});
