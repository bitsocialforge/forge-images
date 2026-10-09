// Lazy Cloudflare Turnstile: the script loads on the first upload, and each
// upload gets a fresh single-use token. The widget stays invisible unless
// Cloudflare asks the visitor to interact.

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_TIMEOUT_MS = 15_000;
const TOKEN_TIMEOUT_MS = 120_000;

let scriptPromise = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = setTimeout(() => fail(new Error("Cloudflare's check did not load. Try again.")), SCRIPT_TIMEOUT_MS);
    function fail(error) {
      clearTimeout(timeout);
      script.remove();
      scriptPromise = null;
      reject(error);
    }
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      clearTimeout(timeout);
      if (window.turnstile) resolve(window.turnstile);
      else fail(new Error("Cloudflare's check did not load. Try again."));
    };
    script.onerror = () => fail(new Error("Cloudflare's check could not load. Check your connection or blocker."));
    document.head.append(script);
  });
  return scriptPromise;
}

/** Renders a one-shot widget into `slot` and resolves with its token. */
export async function getTurnstileToken(sitekey, slot) {
  const turnstile = await loadTurnstile();
  return new Promise((resolve, reject) => {
    const container = document.createElement("div");
    slot.append(container);
    let widgetId = null;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("Cloudflare's check timed out. Try again.")), TOKEN_TIMEOUT_MS);

    function finish(error, token) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (widgetId !== null) {
        try {
          turnstile.remove(widgetId);
        } catch {
          // Already gone; removing the container below is enough.
        }
      }
      container.remove();
      if (error) reject(error);
      else resolve(token);
    }

    try {
      widgetId = turnstile.render(container, {
        sitekey,
        appearance: "interaction-only",
        retry: "never",
        "refresh-expired": "never",
        "response-field": false,
        callback: (token) => finish(token ? null : new Error("Cloudflare's check returned no token."), token),
        "error-callback": (code) => {
          finish(new Error(`Cloudflare's check failed (${code}). Try again.`));
          return true;
        },
        "expired-callback": () => finish(new Error("Cloudflare's check expired. Try again.")),
        "timeout-callback": () => finish(new Error("Cloudflare's check timed out. Try again.")),
        "unsupported-callback": () => finish(new Error("This browser is not supported by Cloudflare's check.")),
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
