// Serves site/ locally the way Cloudflare Pages serves images.bitsocialforge.com: extensionless URLs
// resolve to .html files and site/_headers applies, so the local site runs under the production CSP.
// The CSP's API and media origins are swapped for the local API (SITE_API_ORIGIN), which also serves
// uploaded media under DEV_SERVE. Started by scripts/start.mjs (`yarn start`).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../site", import.meta.url));
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

// Pages `_headers` format: an unindented URL pattern (`*` matches anything), then indented
// `Name: value` lines. Re-read per request so edits apply without a restart.
async function getHeaderRules() {
  const text = await readFile(join(root, "_headers"), "utf8");
  const rules = [];
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      const pattern = line
        .trim()
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replaceAll("*", ".*");
      rules.push({ regExp: new RegExp(`^${pattern}$`), headers: [] });
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1 || rules.length === 0) continue;
    let value = line.slice(separator + 1).trim();
    for (const origin of productionOrigins) value = value.replaceAll(origin, apiOrigin);
    rules.at(-1).headers.push([line.slice(0, separator).trim(), value]);
  }
  return rules;
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

    // `_headers` is Pages configuration, not a published file.
    const filePath = pathname === "/_headers" ? null : await findFile(pathname);
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
