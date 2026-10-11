import { ForgeImagesError, uploadUrl, type UploadResult } from "@bitsocialforge/forge-images-client";
import { LIMITS, type FileKind, type SiteConfig } from "./config";
import { waitUntilServed } from "./media-probe";
import { getTurnstileToken } from "./turnstile";

export type Tone = "ok" | "error";

/** What the upload flow reports for one file; the page renders it as a result row. */
export interface UploadRowHandle {
  setStatus(text: string, tone?: Tone): void;
  setProgress(fraction: number | null): void;
  /** The stored size, for a row that did not know it (a link). */
  setSize(bytes: number): void;
  showLink(url: string): void;
}

export interface SendOptions {
  hideName: boolean;
  slot: HTMLElement;
  config: SiteConfig;
}

const NETWORK_ERROR = "Network error. Check your connection and try again.";

/** Client-side precheck only; the API sniffs magic bytes and is authoritative. */
export function classify(file: Pick<File, "name" | "type">): FileKind | null {
  const name = file.name.toLowerCase();
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  if (file.type === "application/x-shockwave-flash" || name.endsWith(".swf")) return "swf";
  if (/^video\/(mp4|webm)$/.test(file.type) || /\.(mp4|webm)$/.test(name)) return "video";
  if (/^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/.test(name)) return "image";
  return null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const KIND_NAMES: Record<FileKind, string> = { image: "images", gif: "GIFs", swf: "SWFs", video: "videos" };

/** "Images up to 10 MB, GIFs and SWFs up to 20 MB, videos up to 50 MB", from the limits in config.ts. */
export function describeLimits(limits: Record<FileKind, number> = LIMITS): string {
  const kindsByLimit = new Map<number, string[]>();
  for (const kind of Object.keys(KIND_NAMES) as FileKind[]) {
    kindsByLimit.set(limits[kind], [...(kindsByLimit.get(limits[kind]) ?? []), KIND_NAMES[kind]]);
  }
  const text = [...kindsByLimit]
    .map(([bytes, names]) => `${names.join(" and ")} up to ${bytes / (1024 * 1024)} MB`)
    .join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The type and size checks a file passes before it is queued, or the message for its row. */
export function checkFile(
  file: Pick<File, "name" | "type" | "size">,
): { ok: true; kind: FileKind } | { ok: false; message: string } {
  const kind = classify(file);
  if (!kind) return { ok: false, message: "Not accepted: upload JPEG, PNG, WebP, GIF, MP4, WebM, or SWF files." };
  if (file.size > LIMITS[kind]) {
    return { ok: false, message: `Too large: the limit for this type is ${formatSize(LIMITS[kind])}.` };
  }
  return { ok: true, kind };
}

/** A link the page can send: absolute http or https. The API checks the rest (invalid_url, url_not_allowed). */
export function checkUrl(value: string): { ok: true; url: string } | { ok: false; message: string } {
  try {
    const url = new URL(value.trim());
    if (url.protocol === "http:" || url.protocol === "https:") return { ok: true, url: url.href };
  } catch {
    // Not a URL at all.
  }
  return { ok: false, message: "Enter a full link that starts with https:// or http://." };
}

/** The `{ error: { message } }` text of an API error body, if any. */
export function apiErrorMessage(body: unknown): string | undefined {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === "string" && message ? message : undefined;
}

export function describeUploadFailure(status: number, message: string | undefined, source: "file" | "url"): string {
  if (status === 429) {
    // Links also count against a lower hourly fetch limit than files.
    return source === "url"
      ? "Too many uploads from your connection. Uploads from links have a lower hourly limit. Try again later."
      : "Too many uploads from your connection. Try again later.";
  }
  // magic-bytes.ts rejects a declared type that contradicts the content, e.g. a WebP saved as .jpg. Renaming is
  // only possible for a file from this device.
  if (source === "file" && status === 415 && message?.includes("contradicts")) {
    return "The file's extension does not match its contents (for example, a WebP saved as .jpg). Rename it with the right extension and try again.";
  }
  if (status === 403) return message ? `Upload refused: ${message}` : "Upload refused.";
  return message ? `Upload failed: ${message}` : `Upload failed (HTTP ${status}).`;
}

/**
 * XHR instead of fetch (and instead of the client package's uploadFile) so the row can show upload progress.
 * The form mirrors uploadFile: text fields first, because the API settles Turnstile before reading the file.
 */
function postUpload(
  apiOrigin: string,
  file: File,
  token: string,
  hideName: boolean,
  onProgress: (fraction: number) => void,
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("turnstile", token);
  if (hideName) formData.append("filename", "");
  formData.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiOrigin}/api/upload`);
    xhr.responseType = "json";
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener("load", () => {
      const body: unknown = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300 && typeof (body as UploadResult | null)?.url === "string") {
        resolve(body as UploadResult);
      } else {
        reject(new Error(describeUploadFailure(xhr.status, apiErrorMessage(body), "file")));
      }
    });
    xhr.addEventListener("error", () => reject(new Error(NETWORK_ERROR)));
    xhr.send(formData);
  });
}

async function reportWhenServed(row: UploadRowHandle, url: string, isVideo: boolean) {
  if (await waitUntilServed(url, isVideo)) row.setStatus("Live. The link works now.", "ok");
  else row.setStatus("Uploaded, but still under review. The link will work once it is approved.");
}

/** Shows the link and what happens next. Polling for a pending file runs detached so the queue moves on. */
function reportUploaded(row: UploadRowHandle, body: UploadResult) {
  row.showLink(body.url);
  if (body.status === "live") {
    row.setStatus("Live. The link works now.", "ok");
  } else if (body.mime === "application/x-shockwave-flash") {
    row.setStatus("Uploaded. New SWF files are reviewed by a person; the link returns 404 until approved.");
  } else if (body.mime.startsWith("video/")) {
    row.setStatus("Uploaded. Checking frames from the video; the link works in a minute or less…");
    void reportWhenServed(row, body.url, true);
  } else {
    row.setStatus("Uploaded. Running automated checks; the link works in a few seconds…");
    void reportWhenServed(row, body.url, false);
  }
}

/** Token + POST for one file. */
export async function sendOne(
  file: File,
  row: UploadRowHandle,
  { hideName, slot, config }: SendOptions,
): Promise<void> {
  try {
    row.setStatus("Checking your browser…");
    const token = await getTurnstileToken(config.turnstileSitekey, slot);

    row.setStatus("Uploading…");
    row.setProgress(0);
    const body = await postUpload(config.apiOrigin, file, token, hideName, (fraction) => row.setProgress(fraction));
    row.setProgress(null);
    reportUploaded(row, body);
  } catch (error) {
    row.setProgress(null);
    row.setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

/** Token + POST for one link, which the API downloads. No progress: the transfer happens on the server. */
export async function sendUrl(
  url: string,
  row: UploadRowHandle,
  { hideName, slot, config }: SendOptions,
): Promise<void> {
  try {
    row.setStatus("Checking your browser…");
    const turnstileToken = await getTurnstileToken(config.turnstileSitekey, slot);

    row.setStatus("Fetching the file from the link…");
    const body = await uploadUrl(url, {
      apiOrigin: config.apiOrigin,
      turnstileToken,
      filename: hideName ? null : undefined,
    });
    row.setSize(body.size);
    reportUploaded(row, body);
  } catch (error) {
    row.setStatus(describeUrlError(error), "error");
  }
}

function describeUrlError(error: unknown): string {
  if (error instanceof ForgeImagesError) return describeUploadFailure(error.status, error.message, "url");
  // fetch rejects with a TypeError when the request cannot be sent at all.
  if (error instanceof TypeError) return NETWORK_ERROR;
  return error instanceof Error ? error.message : String(error);
}
