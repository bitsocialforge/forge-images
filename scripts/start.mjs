// `yarn start`: runs the Vite dev server (React Refresh, Agentation) under the production CSP from vercel.json and
// opens it. vite.config.ts applies the headers, swaps the CSP's API and media origins for the local API, and adds
// the dev-only CSP sources Vite needs. Uploads and reports go to a local Forge Images API, which runs from the
// private server repo (`yarn start` there).
// Through portless the site is https://forge-images.localhost and expects the API at
// https://api.forge-images.localhost: site/src/lib/config.ts always uses api.<site host>. On a branch other than
// master the site gets a branch label (https://<branch>.forge-images.localhost), so run the server repo on a
// branch with the same name. PORTLESS=0 (and Windows) serves on http://localhost:8080 (or the next free port)
// with the API at http://127.0.0.1:3917, the address config.ts expects. BROWSER=none skips opening it.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const isWindows = process.platform === "win32";
const portlessBin = fileURLToPath(new URL(`../node_modules/.bin/portless${isWindows ? ".cmd" : ""}`, import.meta.url));
// portless recognizes Vite by the command's basename; without portless, Node runs Vite directly (no shell on Windows).
const viteBin = fileURLToPath(new URL("../node_modules/.bin/vite", import.meta.url));
const viteEntry = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const usePortless = process.env.PORTLESS !== "0" && !isWindows && existsSync(portlessBin);
const portlessEnv = {
  ...process.env,
  PORTLESS_PORT: process.env.PORTLESS_PORT || "443",
  PORTLESS_HTTPS: process.env.PORTLESS_HTTPS ?? "1",
  PORTLESS_LAN: process.env.PORTLESS_LAN ?? "0",
};
const portlessBaseName = "forge-images";
const fallbackSitePort = Number(process.env.PORT) || 8080;

function sanitizeLabel(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getPortlessAppName() {
  const list = spawnSync(portlessBin, ["list"], { cwd: repoRoot, encoding: "utf8" });
  const busyHosts = new Set(
    (list.stdout?.match(/https?:\/\/[a-z0-9.-]+\.localhost/g) ?? []).map((url) => new URL(url).hostname),
  );
  const isBusy = (name) => busyHosts.has(`${name}.localhost`);

  const branch = spawnSync("git", ["branch", "--show-current"], { cwd: repoRoot, encoding: "utf8" }).stdout?.trim();
  const branchName = `${sanitizeLabel(branch || "current")}.${portlessBaseName}`;
  const preferred =
    branch && branch !== "master" && branch !== "main"
      ? branchName
      : isBusy(portlessBaseName)
        ? branchName
        : portlessBaseName;

  if (!isBusy(preferred)) return preferred;
  for (let suffix = 2; ; suffix += 1) {
    if (!isBusy(`${preferred}-${suffix}`)) return `${preferred}-${suffix}`;
  }
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

function isUrlReady(url) {
  return new Promise((resolve) => {
    const get = url.startsWith("https:") ? httpsGet : httpGet;
    const request = get(url, { rejectUnauthorized: false }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 400);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(2_000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function openWhenReady(url) {
  const deadline = Date.now() + 30_000;
  while (!(await isUrlReady(url))) {
    if (Date.now() > deadline) {
      console.warn(`Could not auto-open ${url}: timed out waiting for it to respond`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  console.log(`Opening ${url} in browser...`);
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : isWindows
        ? ["cmd", ["/c", "start", '""', url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

let siteUrl;
let apiOrigin;
let child;

if (usePortless) {
  const proxy = spawnSync(portlessBin, ["proxy", "start", "--port", portlessEnv.PORTLESS_PORT, "--https"], {
    cwd: repoRoot,
    env: portlessEnv,
    stdio: "inherit",
  });
  if (proxy.status !== 0) process.exit(proxy.status ?? 1);

  const appName = getPortlessAppName();
  siteUrl = `https://${appName}.localhost`;
  apiOrigin = `https://api.${appName}.localhost`;
  // portless passes Vite its --port and --host.
  child = spawn(portlessBin, [appName, viteBin], {
    cwd: repoRoot,
    env: { ...portlessEnv, SITE_API_ORIGIN: apiOrigin },
    stdio: "inherit",
  });
} else {
  let sitePort = fallbackSitePort;
  while (!(await isPortFree(sitePort))) sitePort += 1;
  siteUrl = `http://localhost:${sitePort}`;
  apiOrigin = "http://127.0.0.1:3917";
  child = spawn(process.execPath, [viteEntry, "--host", "127.0.0.1", "--port", String(sitePort), "--strictPort"], {
    cwd: repoRoot,
    env: { ...process.env, SITE_API_ORIGIN: apiOrigin },
    stdio: "inherit",
  });
}

console.log(`Site: ${siteUrl}\nAPI:  ${apiOrigin} (start it from the forge-images-server repo)`);
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));

if (process.env.BROWSER !== "none") openWhenReady(siteUrl);
