// Renders each page to HTML in Node: at build time for the static files (scripts/prerender.mjs), and per request
// in the dev server (vite.config.ts). The client entries in src/entries/ hydrate the same trees.
import { StrictMode, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { FaqPage } from "./pages/faq-page";
import { LegalPage } from "./pages/legal-page";
import { ReportPage } from "./pages/report-page";
import { UploadPage } from "./pages/upload-page";

/** Keyed by HTML file name: `index` is site/index.html, served at `/`. */
const pages: Record<string, ComponentType> = {
  index: UploadPage,
  faq: FaqPage,
  legal: LegalPage,
  report: ReportPage,
};

/** Replaced by the rendered page in each HTML file. */
export const APP_PLACEHOLDER = "<!--app-html-->";

export const pageNames = Object.keys(pages);

export function renderPage(name: string): string {
  const Page = pages[name];
  if (!Page) throw new Error(`No page component for ${name}.html`);
  return renderToString(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
