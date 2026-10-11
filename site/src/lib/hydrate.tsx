import { StrictMode, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import "./dev-tools";

/** Attaches React to a page whose markup was prerendered into #root (scripts/prerender.mjs, or the dev server). */
export function hydratePage(page: ReactNode) {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root element");
  hydrateRoot(root, <StrictMode>{page}</StrictMode>);
}
