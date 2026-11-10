import { useEffect, useState } from "react";

/**
 * False in the prerendered markup and while it hydrates, true once React has attached the page's event handlers.
 * Controls that only work through those handlers stay disabled until then: before that a click would be lost
 * silently, since the CSP blocks a native form submit (form-action 'none').
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
