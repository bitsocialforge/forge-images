import { afterEach, describe, expect, it, vi } from "vitest";
import { isVideoServed, VIDEO_PROBE_TIMEOUT_MS } from "./media-probe";

const MEDIA_URL = "https://forgeimg.net/abc.mp4";

/** A detached <video> stand-in that fires loadedmetadata (or error) when it gets a src. */
function stubVideoElement(loads: boolean) {
  const video = {
    onloadedmetadata: null as (() => void) | null,
    onerror: null as (() => void) | null,
    preload: "",
    muted: false,
    removeAttribute: vi.fn(),
    load: vi.fn(),
    set src(_value: string) {
      queueMicrotask(() => (loads ? video.onloadedmetadata : video.onerror)?.());
    },
  };
  const createElement = vi.fn(() => video);
  vi.stubGlobal("document", { createElement });
  return createElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("isVideoServed", () => {
  it("asks the media origin with a credential-less HEAD and never decodes the video", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const createElement = stubVideoElement(false);

    await expect(isVideoServed(MEDIA_URL)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      MEDIA_URL,
      expect.objectContaining({ method: "HEAD", cache: "no-store", mode: "cors", credentials: "omit" }),
    );
    expect(createElement).not.toHaveBeenCalled();
  });

  it("reports a pending file (404) as not served yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(isVideoServed(MEDIA_URL)).resolves.toBe(false);
  });

  it("falls back to a metadata load when the request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const createElement = stubVideoElement(true);

    await expect(isVideoServed(MEDIA_URL)).resolves.toBe(true);
    expect(createElement).toHaveBeenCalledWith("video");
  });

  it("gives up on a hanging request after the probe timeout without a fallback", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
      ),
    );
    const createElement = stubVideoElement(true);

    const served = isVideoServed(MEDIA_URL);
    await vi.advanceTimersByTimeAsync(VIDEO_PROBE_TIMEOUT_MS);
    await expect(served).resolves.toBe(false);
    expect(createElement).not.toHaveBeenCalled();
  });
});
