import { API_ORIGIN, LIMITS, TURNSTILE_SITEKEY } from "./config.js";
import { getTurnstileToken } from "./turnstile.js";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const chooseButton = document.getElementById("choose-button");
const hideFilename = document.getElementById("hide-filename");
const turnstileSlot = document.getElementById("turnstile-slot");
const results = document.getElementById("results");

const PENDING_WAIT_MS = 60_000;
// Video checks decode sampled frames, so they take longer than images.
const PENDING_VIDEO_WAIT_MS = 120_000;
const PENDING_MAX_DELAY_MS = 8_000;
const VIDEO_PROBE_TIMEOUT_MS = 10_000;

/** Client-side precheck only; the API sniffs magic bytes and is authoritative. */
function classify(file) {
  const name = file.name.toLowerCase();
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  if (file.type === "application/x-shockwave-flash" || name.endsWith(".swf")) return "swf";
  if (/^video\/(mp4|webm)$/.test(file.type) || /\.(mp4|webm)$/.test(name)) return "video";
  if (/^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/.test(name)) return "image";
  return null;
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createRow(file) {
  const label = file.name || "pasted file";
  const row = document.createElement("li");
  row.className = "result";
  const name = document.createElement("div");
  name.className = "result-name";
  name.textContent = `${label} (${formatSize(file.size)})`;
  const status = document.createElement("p");
  status.className = "result-status";
  // Progress lives outside the status text so the results live region only
  // announces state changes, not every percentage tick.
  const progress = document.createElement("progress");
  progress.className = "result-progress";
  progress.max = 1;
  progress.value = 0;
  progress.hidden = true;
  progress.setAttribute("aria-label", `Upload progress for ${label}`);
  row.append(name, status, progress);
  results.prepend(row);
  return {
    setStatus(text, tone) {
      status.textContent = text;
      if (tone) status.dataset.tone = tone;
      else delete status.dataset.tone;
    },
    setProgress(fraction) {
      progress.hidden = fraction === null;
      if (fraction !== null) progress.value = fraction;
    },
    showLink(url) {
      const wrap = document.createElement("div");
      wrap.className = "result-link";
      const input = document.createElement("input");
      input.type = "text";
      input.readOnly = true;
      input.value = url;
      input.setAttribute("aria-label", `Link for ${label}`);
      input.addEventListener("focus", () => input.select());
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "button button-secondary";
      copy.textContent = "Copy";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(url);
          copy.textContent = "Copied";
        } catch {
          input.focus();
          input.select();
          copy.textContent = "Press Ctrl+C";
        }
      });
      const open = document.createElement("a");
      open.className = "button button-secondary";
      open.href = url;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.textContent = "Open";
      wrap.append(input, copy, open);
      row.append(wrap);
    },
  };
}

function describeFailure(status, body) {
  const message = body?.error?.message;
  if (status === 429) return "Too many uploads from your connection. Try again later.";
  // magic-bytes.ts rejects a declared type that contradicts the content, e.g. a WebP saved as .jpg.
  if (status === 415 && typeof message === "string" && message.includes("contradicts")) {
    return "The file's extension does not match its contents (for example, a WebP saved as .jpg). Rename it with the right extension and try again.";
  }
  if (status === 403) return message ? `Upload refused: ${message}` : "Upload refused.";
  return message ? `Upload failed: ${message}` : `Upload failed (HTTP ${status}).`;
}

/** XHR instead of fetch so the row can show upload progress. */
function postUpload(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_ORIGIN}/api/upload`);
    xhr.responseType = "json";
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener("load", () => {
      const body = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300 && body && typeof body.url === "string") resolve(body);
      else reject(new Error(describeFailure(xhr.status, body)));
    });
    xhr.addEventListener("error", () => reject(new Error("Network error. Check your connection and try again.")));
    xhr.send(formData);
  });
}

function canLoadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.referrerPolicy = "no-referrer";
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    // Retrying the plain URL relies on pending 404s being uncacheable, a deploy gate in INFRA.md §3.
    image.src = url;
  });
}

/** Loads only the video's metadata; a browser that cannot decode the codec also reports false. */
function canLoadVideo(url, timeoutMs) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const timeout = setTimeout(() => settle(false), timeoutMs);
    function settle(loaded) {
      clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onerror = null;
      // Stop the download; the element was never attached to the page.
      video.removeAttribute("src");
      video.load();
      resolve(loaded);
    }
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => settle(true);
    video.onerror = () => settle(false);
    video.src = url;
  });
}

/**
 * Asks the media origin instead of decoding the video, so a codec this browser cannot play (HEVC in
 * Firefox) still reports live. 2xx is live, anything else not yet. When the request itself fails
 * (network error, or no CORS on the media origin), this attempt falls back to a metadata load.
 */
async function isVideoServed(url) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VIDEO_PROBE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
  } catch {
    // A timed-out request used this attempt's budget; the next attempt retries.
    if (controller.signal.aborted) return false;
    return canLoadVideo(url, VIDEO_PROBE_TIMEOUT_MS - (Date.now() - startedAt));
  } finally {
    clearTimeout(timeout);
  }
  return response.ok;
}

/** New files 404 until automated checks finish. Poll with backoff, bounded. */
async function waitUntilServed(url, isVideo) {
  const deadline = Date.now() + (isVideo ? PENDING_VIDEO_WAIT_MS : PENDING_WAIT_MS);
  let delay = 1_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (await (isVideo ? isVideoServed(url) : canLoadImage(url))) return true;
    delay = Math.min(delay * 2, PENDING_MAX_DELAY_MS);
  }
  return false;
}

async function reportWhenServed(row, url, isVideo) {
  if (await waitUntilServed(url, isVideo)) row.setStatus("Live. The link works now.", "ok");
  else row.setStatus("Uploaded, but still under review. The link will work once it is approved.");
}

/** Token + POST for one file. Polling for a pending file runs detached so the queue moves on. */
async function sendOne(file, row, hideName) {
  try {
    row.setStatus("Checking your browser…");
    const token = await getTurnstileToken(TURNSTILE_SITEKEY, turnstileSlot);

    const formData = new FormData();
    // Text fields first: the API settles Turnstile before reading the file.
    formData.append("turnstile", token);
    if (hideName) formData.append("filename", "");
    formData.append("file", file);

    row.setStatus("Uploading…");
    row.setProgress(0);
    const body = await postUpload(formData, (fraction) => row.setProgress(fraction));
    row.setProgress(null);
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
  } catch (error) {
    row.setProgress(null);
    row.setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

let queue = Promise.resolve();

function addFiles(fileList) {
  // Read the option now: toggling it later must not change files already added.
  const hideName = hideFilename.checked;
  for (const file of Array.from(fileList)) {
    const row = createRow(file);
    const kind = classify(file);
    if (!kind) {
      row.setStatus("Not accepted: upload JPEG, PNG, WebP, GIF, MP4, WebM, or SWF files.", "error");
      continue;
    }
    if (file.size > LIMITS[kind]) {
      row.setStatus(`Too large: the limit for this type is ${formatSize(LIMITS[kind])}.`, "error");
      continue;
    }
    row.setStatus("Queued.");
    // One upload at a time: each needs its own Turnstile token and rate-limit slot.
    queue = queue.then(() => sendOne(file, row, hideName));
  }
}

chooseButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("is-dragging");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-dragging"));
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-dragging");
  if (event.dataTransfer?.files.length) addFiles(event.dataTransfer.files);
});
// A file dropped outside the drop zone would otherwise navigate away from the page.
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

document.addEventListener("paste", (event) => {
  const files = event.clipboardData?.files;
  if (files?.length) {
    event.preventDefault();
    addFiles(files);
  }
});
