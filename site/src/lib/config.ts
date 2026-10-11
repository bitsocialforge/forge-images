// Endpoints and limits for the Forge Images site. Production values are the defaults; a page opened locally
// talks to a local API (README "Website"): under portless, https://<name>.localhost pairs with
// https://api.<name>.localhost. Resolved from the page location at call time, never at import, so the pages
// can be prerendered in Node.
import { DEFAULT_API_ORIGIN } from "@bitsocialforge/forge-images-client";

export interface SiteConfig {
  apiOrigin: string;
  turnstileSitekey: string;
}

export type PageLocation = Pick<Location, "hostname" | "host" | "protocol">;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
export const LOCAL_API_ORIGIN = "http://127.0.0.1:3917";
// Cloudflare's always-pass invisible test key locally; the real widget key in production.
export const TEST_TURNSTILE_SITEKEY = "1x00000000000000000000BB";
export const TURNSTILE_SITEKEY = "0x4AAAAAAFScwbbNFZtx0XVP";

export function resolveSiteConfig(location: PageLocation): SiteConfig {
  const isPortless = location.hostname.endsWith(".localhost");
  const isLocal = isPortless || LOCAL_HOSTS.has(location.hostname);
  return {
    apiOrigin: isPortless
      ? `${location.protocol}//api.${location.host}`
      : isLocal
        ? LOCAL_API_ORIGIN
        : DEFAULT_API_ORIGIN,
    turnstileSitekey: isLocal ? TEST_TURNSTILE_SITEKEY : TURNSTILE_SITEKEY,
  };
}

const MIB = 1024 * 1024;

// Anonymous caps, mirroring the API defaults (.env.example). The API is authoritative.
export const LIMITS = {
  image: 10 * MIB,
  gif: 20 * MIB,
  swf: 20 * MIB,
  video: 50 * MIB,
};

export type FileKind = keyof typeof LIMITS;
