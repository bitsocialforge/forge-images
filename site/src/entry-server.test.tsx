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

  it("marks the current page in the navigation", () => {
    expect(renderPage("faq")).toContain('<a href="/faq" aria-current="page">FAQ</a>');
    expect(renderPage("index")).toContain('<a href="/" aria-current="page">Upload</a>');
  });
});
