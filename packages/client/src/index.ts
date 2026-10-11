/**
 * Forge Images client: upload and report against the public API (docs/API.md).
 * Dependency-free; works in browsers and Node 22+ (global fetch, FormData, Blob).
 */

export const DEFAULT_API_ORIGIN = "https://img-api.bitsocialforge.com";
export const DEFAULT_MEDIA_ORIGIN = "https://forgeimg.net";

/** `live` serves now; `pending` serves after moderation (seconds for images, longer when a person reviews it). */
export type UploadStatus = "live" | "pending";

export interface UploadResult {
  /** Permanent media URL. Includes the filename (`/<sha256>/<name>.<ext>`) unless it was left out. */
  url: string;
  /** Hex sha256 of the stored bytes; the file's identity. */
  sha256: string;
  size: number;
  /** Type detected from the file's contents. */
  mime: string;
  status: UploadStatus;
}

export interface ClientOptions {
  /** API origin, default https://img-api.bitsocialforge.com. */
  apiOrigin?: string;
  /** Free integration key; requests with a key skip Turnstile and use integration limits. */
  apiKey?: string;
  signal?: AbortSignal;
  /** Custom fetch (tests, proxies). Defaults to the global fetch. */
  fetch?: typeof fetch;
}

export interface UploadOptions extends ClientOptions {
  /** Cloudflare Turnstile token; required for anonymous uploads (no apiKey). Single use. */
  turnstileToken?: string;
  /**
   * Name shown in the URL. Omit to use the File's name, pass a string to set it,
   * or `null` to leave the name out and get the canonical `/<sha256>.<ext>` URL.
   */
  filename?: string | null;
}

export type ReportReason = "csam" | "illegal" | "dmca" | "other";

export interface ReportInput {
  /** Any URL form of the file, or its sha256. */
  url?: string;
  sha256?: string;
  reason: ReportReason;
  detail?: string;
}

/** API error with the documented `{ error: { code, message } }` body. */
export class ForgeImagesError extends Error {
  readonly status: number;
  readonly code: string;
  /** Seconds to wait before retrying, from Retry-After on 429. */
  readonly retryAfterSeconds?: number;

  constructor(status: number, code: string, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "ForgeImagesError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const trimOrigin = (origin: string) => origin.replace(/\/+$/, "");

async function toError(response: Response): Promise<ForgeImagesError> {
  const body = (await response.json().catch(() => null)) as { error?: { code?: unknown; message?: unknown } } | null;
  const code = typeof body?.error?.code === "string" ? body.error.code : "http_error";
  const message =
    typeof body?.error?.message === "string"
      ? body.error.message
      : `HTTP ${response.status} ${response.statusText}`.trim();
  const retryAfter = Number(response.headers.get("retry-after"));
  return new ForgeImagesError(
    response.status,
    code,
    message,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  );
}

function authHeaders(apiKey: string | undefined): Record<string, string> | undefined {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
}

/**
 * Uploads one file. Anonymous uploads need a fresh Turnstile token for each call.
 * @throws ForgeImagesError for API errors (403 Turnstile/ban, 413 too large, 415 type, 429 rate limit, ...).
 */
export async function uploadFile(file: Blob, options: UploadOptions = {}): Promise<UploadResult> {
  const { apiOrigin = DEFAULT_API_ORIGIN, apiKey, turnstileToken, filename, signal } = options;
  const doFetch = options.fetch ?? fetch;
  if (!apiKey && !turnstileToken) {
    throw new TypeError("Anonymous uploads need a turnstileToken (or pass an apiKey)");
  }

  const form = new FormData();
  // Text fields first: the API settles Turnstile before reading the file.
  if (turnstileToken) form.append("turnstile", turnstileToken);
  if (filename !== undefined) form.append("filename", filename ?? "");
  form.append("file", file);

  const response = await doFetch(`${trimOrigin(apiOrigin)}/api/upload`, {
    method: "POST",
    body: form,
    headers: authHeaders(apiKey),
    signal,
  });
  if (!response.ok) throw await toError(response);
  const body = (await response.json()) as Partial<UploadResult>;
  if (
    typeof body.url !== "string" ||
    typeof body.sha256 !== "string" ||
    (body.status !== "live" && body.status !== "pending")
  ) {
    throw new ForgeImagesError(response.status, "bad_response", "Upload response is missing url, sha256, or status");
  }
  return body as UploadResult;
}

/** Reports a file. The API always answers 202, whether or not the file exists. */
export async function reportFile(input: ReportInput, options: ClientOptions = {}): Promise<void> {
  const { apiOrigin = DEFAULT_API_ORIGIN, apiKey, signal } = options;
  const doFetch = options.fetch ?? fetch;
  if (!input.url && !input.sha256) throw new TypeError("reportFile needs a url or sha256");

  const response = await doFetch(`${trimOrigin(apiOrigin)}/api/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw await toError(response);
}

// The media URL grammar (forge-images-server src/lib/media-url.ts, mirrored by the edge rewrite):
// canonical /<sha256>.<ext>; named /<sha256>[junk]/<anything>.<ext>, where only the hash and the
// last extension (lowercased) matter.
const CANONICAL_RE = /^\/([a-f0-9]{64})\.([a-z0-9]+)$/;
const NAMED_RE = /^\/([a-f0-9]{64})[^/]*\/.*[^/]\.([A-Za-z0-9]+)$/;

/** Returns the canonical `/<sha256>.<ext>` URL for either URL form, or null if it is not a Forge media URL. */
export function canonicalMediaUrl(url: string, mediaOrigin: string = DEFAULT_MEDIA_ORIGIN): string | null {
  const origin = trimOrigin(mediaOrigin);
  if (!url.startsWith(`${origin}/`)) return null;
  const path = url.slice(origin.length).replace(/[?#].*$/, "");
  const match = NAMED_RE.exec(path) ?? CANONICAL_RE.exec(path);
  return match ? `${origin}/${match[1]}.${match[2]!.toLowerCase()}` : null;
}
