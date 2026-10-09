// Endpoints and limits for the Forge Images site. Production values are the
// defaults; a page opened locally talks to a local API (README "Website"):
// under portless, https://<name>.localhost pairs with https://api.<name>.localhost.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const isPortless = location.hostname.endsWith(".localhost");
const isLocal = isPortless || LOCAL_HOSTS.has(location.hostname);

export const API_ORIGIN = isPortless
  ? `${location.protocol}//api.${location.host}`
  : isLocal
    ? "http://127.0.0.1:3917"
    : "https://img-api.bitsocialforge.com";

// Cloudflare's always-pass invisible test key locally; the real widget key in production.
export const TURNSTILE_SITEKEY = isLocal ? "1x00000000000000000000BB" : "0x4AAAAAAFScwbbNFZtx0XVP";

const MIB = 1024 * 1024;

// Anonymous caps, mirroring the API defaults (.env.example). The API is authoritative.
export const LIMITS = {
  image: 10 * MIB,
  gif: 20 * MIB,
  swf: 20 * MIB,
};
