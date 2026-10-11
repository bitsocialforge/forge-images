import { describe, expect, it } from "vitest";
import { pageNames, renderPage } from "./entry-server";

describe("renderPage", () => {
  it("renders every page in Node, where the build prerenders them", () => {
    expect(pageNames).toEqual(["index", "faq", "legal", "report"]);
    for (const name of pageNames) expect(renderPage(name)).toContain("<main>");
  });

  it("puts the legal text, including the DMCA agent, in the markup", () => {
    const html = renderPage("legal");
    expect(html).toContain("Effective October 11, 2026.");
    expect(html).toContain("Copyright Agent, Bitsocial Forge Inc.<br/> 1021 E Lincolnway, PMB 7723");
    expect(html).toContain('<h2 id="child-safety">Child safety</h2>');
  });

  it("leads the upload page with the limits line and keeps the results inside the drop box", () => {
    const html = renderPage("index");
    expect(html).toContain('<h1 class="visually-hidden">Free image and video hosting</h1>');
    expect(html).toContain(
      'Images up to 10 MB, GIFs and SWFs up to 20 MB, videos up to 50 MB<!-- -->. You should <a href="/faq">read the FAQ</a>.',
    );
    const dropzone = html.slice(html.indexOf('<section id="dropzone"'), html.indexOf("</section>"));
    expect(dropzone).toMatch(/^<section id="dropzone"[^>]*><button id="choose-button"[^>]*>/);
    // The results list follows the picker button inside the box instead of being nested in it.
    expect(dropzone).toMatch(/<\/button>.*<ol id="results"/);
    expect(dropzone.match(/<button/g)).toHaveLength(1);
  });

  it("marks the current page in the navigation", () => {
    expect(renderPage("faq")).toContain('<a href="/faq" aria-current="page">FAQ</a>');
    expect(renderPage("index")).toContain('<a href="/" aria-current="page">Upload</a>');
  });
});
