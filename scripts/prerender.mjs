// Second half of `yarn build:site`, after `vite build` wrote dist/: builds site/src/entry-server.tsx for Node,
// renders every page to HTML, and writes it into the #root placeholder of the matching dist/<page>.html, so the
// pages (the FAQ and legal text included) work without JavaScript. The client entries then hydrate that markup.
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const distDir = fileURLToPath(new URL("../dist/", import.meta.url));
// Inside the repository so the bundle's bare imports (react, react-dom) resolve from node_modules.
const ssrOutDir = fileURLToPath(new URL("../node_modules/.cache/forge-images-prerender/", import.meta.url));

await build({
  logLevel: "warn",
  build: {
    ssr: "src/entry-server.tsx",
    outDir: ssrOutDir,
    emptyOutDir: true,
    copyPublicDir: false,
  },
});

try {
  const { APP_PLACEHOLDER, pageNames, renderPage } = await import(
    pathToFileURL(join(ssrOutDir, "entry-server.js")).href
  );
  const htmlFiles = (await readdir(distDir)).filter((file) => file.endsWith(".html")).sort();
  const expected = pageNames.map((name) => `${name}.html`).sort();
  if (htmlFiles.join() !== expected.join()) {
    throw new Error(`dist has ${htmlFiles.join(", ")} but entry-server renders ${expected.join(", ")}`);
  }

  for (const name of pageNames) {
    const file = join(distDir, `${name}.html`);
    const html = await readFile(file, "utf8");
    const parts = html.split(APP_PLACEHOLDER);
    if (parts.length !== 2) throw new Error(`${name}.html needs exactly one ${APP_PLACEHOLDER} placeholder`);
    await writeFile(file, parts.join(renderPage(name)));
    console.log(`prerendered dist/${name}.html`);
  }
} finally {
  await rm(ssrOutDir, { recursive: true, force: true });
}
