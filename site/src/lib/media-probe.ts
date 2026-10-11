// Polls a newly uploaded file until the media origin serves it. New files 404 until automated checks finish.

const PENDING_WAIT_MS = 60_000;
// Video checks decode sampled frames, so they take longer than images.
const PENDING_VIDEO_WAIT_MS = 120_000;
const PENDING_MAX_DELAY_MS = 8_000;
export const VIDEO_PROBE_TIMEOUT_MS = 10_000;

function canLoadImage(url: string): Promise<boolean> {
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
function canLoadVideo(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const timeout = setTimeout(() => settle(false), timeoutMs);
    function settle(loaded: boolean) {
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
export async function isVideoServed(url: string): Promise<boolean> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VIDEO_PROBE_TIMEOUT_MS);
  let response: Response;
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

/** Polls with backoff, bounded; resolves true once the URL serves. */
export async function waitUntilServed(url: string, isVideo: boolean): Promise<boolean> {
  const deadline = Date.now() + (isVideo ? PENDING_VIDEO_WAIT_MS : PENDING_WAIT_MS);
  let delay = 1_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (await (isVideo ? isVideoServed(url) : canLoadImage(url))) return true;
    delay = Math.min(delay * 2, PENDING_MAX_DELAY_MS);
  }
  return false;
}
