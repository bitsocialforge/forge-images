import { afterEach, describe, expect, it, vi } from "vitest";
import { waitUntilServed } from "./media-probe";
import {
  apiErrorMessage,
  checkFile,
  checkUrl,
  classify,
  describeUploadFailure,
  formatSize,
  sendUrl,
  type UploadRowHandle,
} from "./upload";

vi.mock("./turnstile", () => ({ getTurnstileToken: vi.fn(async () => "turnstile-token") }));
vi.mock("./media-probe", () => ({ waitUntilServed: vi.fn(async () => true) }));

const MIB = 1024 * 1024;
const file = (name: string, type: string, size = 1) => ({ name, type, size });

describe("classify", () => {
  it("uses the declared type or, failing that, the extension", () => {
    expect(classify(file("a.bin", "image/gif"))).toBe("gif");
    expect(classify(file("A.GIF", ""))).toBe("gif");
    expect(classify(file("movie", "application/x-shockwave-flash"))).toBe("swf");
    expect(classify(file("clip.webm", ""))).toBe("video");
    expect(classify(file("clip", "video/mp4"))).toBe("video");
    expect(classify(file("photo.jpeg", ""))).toBe("image");
    expect(classify(file("photo", "image/webp"))).toBe("image");
  });

  it("rejects other types", () => {
    expect(classify(file("clip.mov", "video/quicktime"))).toBeNull();
    expect(classify(file("doc.pdf", "application/pdf"))).toBeNull();
    expect(classify(file("image.heic", "image/heic"))).toBeNull();
  });
});

describe("checkFile", () => {
  it.each([
    ["photo.png", "image/png", 10],
    ["anim.gif", "image/gif", 20],
    ["movie.swf", "application/x-shockwave-flash", 20],
    ["clip.mp4", "video/mp4", 50],
  ])("accepts %s up to %i MB and refuses one byte more", (name, type, limitMib) => {
    expect(checkFile(file(name, type, limitMib * MIB)).ok).toBe(true);
    expect(checkFile(file(name, type, limitMib * MIB + 1))).toEqual({
      ok: false,
      message: `Too large: the limit for this type is ${limitMib}.0 MB.`,
    });
  });

  it("names the accepted types for anything else", () => {
    expect(checkFile(file("notes.txt", "text/plain"))).toEqual({
      ok: false,
      message: "Not accepted: upload JPEG, PNG, WebP, GIF, MP4, WebM, or SWF files.",
    });
  });
});

describe("formatSize", () => {
  it("shows KB below a mebibyte, at least 1 KB, and MB with one decimal above", () => {
    expect(formatSize(10)).toBe("1 KB");
    expect(formatSize(1536)).toBe("2 KB");
    expect(formatSize(MIB - 1)).toBe("1024 KB");
    expect(formatSize(1.25 * MIB)).toBe("1.3 MB");
  });
});

describe("checkUrl", () => {
  it("accepts absolute http and https links, trimmed and normalized", () => {
    expect(checkUrl("  https://example.com/cat.png ")).toEqual({ ok: true, url: "https://example.com/cat.png" });
    expect(checkUrl("HTTP://Example.com/a b.gif")).toEqual({ ok: true, url: "http://example.com/a%20b.gif" });
  });

  it.each(["", "example.com/cat.png", "ftp://example.com/cat.png", "javascript:alert(1)", "data:image/png;base64,AA"])(
    "refuses %j",
    (value) => {
      expect(checkUrl(value)).toEqual({
        ok: false,
        message: "Enter a full link that starts with https:// or http://.",
      });
    },
  );
});

describe("apiErrorMessage", () => {
  it("reads the message of an API error body", () => {
    expect(apiErrorMessage({ error: { code: "x", message: "slow down" } })).toBe("slow down");
    expect(apiErrorMessage({ error: { message: "" } })).toBeUndefined();
    expect(apiErrorMessage(null)).toBeUndefined();
    expect(apiErrorMessage("<html>")).toBeUndefined();
  });
});

describe("describeUploadFailure", () => {
  it("explains rate limits and contradicting extensions", () => {
    expect(describeUploadFailure(429, "slow down", "file")).toBe(
      "Too many uploads from your connection. Try again later.",
    );
    expect(describeUploadFailure(415, "declared type contradicts the content", "file")).toMatch(
      /^The file's extension does not match its contents/,
    );
  });

  it("does not ask to rename a file fetched from a link", () => {
    expect(describeUploadFailure(415, "declared type contradicts the content", "url")).toBe(
      "Upload failed: declared type contradicts the content",
    );
  });

  it("passes the API message through, with an HTTP fallback", () => {
    expect(describeUploadFailure(403, "banned", "file")).toBe("Upload refused: banned");
    expect(describeUploadFailure(403, undefined, "file")).toBe("Upload refused.");
    expect(describeUploadFailure(415, "unsupported", "file")).toBe("Upload failed: unsupported");
    expect(describeUploadFailure(422, "The link answered with HTTP 404.", "url")).toBe(
      "Upload failed: The link answered with HTTP 404.",
    );
    expect(describeUploadFailure(502, undefined, "file")).toBe("Upload failed (HTTP 502).");
  });
});

describe("sendUrl", () => {
  const SHA = "b".repeat(64);
  const config = { apiOrigin: "http://127.0.0.1:3917", turnstileSitekey: "sitekey" };
  const slot = {} as HTMLElement;
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  function recordRow() {
    const calls: Array<[string, ...unknown[]]> = [];
    const row: UploadRowHandle = {
      setStatus: (text, tone) => calls.push(["status", text, tone]),
      setProgress: (fraction) => calls.push(["progress", fraction]),
      setSize: (bytes) => calls.push(["size", bytes]),
      showLink: (url) => calls.push(["link", url]),
    };
    return { row, calls };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("posts the token, the empty filename, and the link, then shows the stored file", async () => {
    const result = {
      url: `https://forgeimg.net/${SHA}.png`,
      sha256: SHA,
      size: 2048,
      mime: "image/png",
      status: "live",
    };
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => json(200, result));
    vi.stubGlobal("fetch", fetchMock);
    const { row, calls } = recordRow();

    await sendUrl("https://example.com/cat.png", row, { hideName: true, slot, config });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:3917/api/upload");
    const form = init.body as FormData;
    expect([...form.entries()]).toEqual([
      ["turnstile", "turnstile-token"],
      ["filename", ""],
      ["url", "https://example.com/cat.png"],
    ]);
    expect(calls).toEqual([
      ["status", "Checking your browser…", undefined],
      ["status", "Fetching the file from the link…", undefined],
      ["size", 2048],
      ["link", result.url],
      ["status", "Live. The link works now.", "ok"],
    ]);
  });

  it("keeps the name from the link unless asked, and polls a pending file like an uploaded one", async () => {
    const result = {
      url: `https://forgeimg.net/${SHA}/clip.mp4`,
      sha256: SHA,
      size: 1,
      mime: "video/mp4",
      status: "pending",
    };
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => json(200, result));
    vi.stubGlobal("fetch", fetchMock);
    const { row, calls } = recordRow();

    await sendUrl("https://example.com/clip.mp4", row, { hideName: false, slot, config });

    expect([...(fetchMock.mock.calls[0]![1].body as FormData).keys()]).toEqual(["turnstile", "url"]);
    expect(calls).toContainEqual([
      "status",
      "Uploaded. Checking frames from the video; the link works in a minute or less…",
      undefined,
    ]);
    expect(waitUntilServed).toHaveBeenCalledWith(result.url, true);
    // The mocked poll finds the file served.
    await vi.waitFor(() => expect(calls.at(-1)).toEqual(["status", "Live. The link works now.", "ok"]));
  });

  it("polls a pending SWF with the longer frame-check wait", async () => {
    const result = {
      url: `https://forgeimg.net/${SHA}/game.swf`,
      sha256: SHA,
      size: 1,
      mime: "application/x-shockwave-flash",
      status: "pending",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(200, result)),
    );
    const { row, calls } = recordRow();

    await sendUrl("https://example.com/game.swf", row, { hideName: false, slot, config });

    expect(calls).toContainEqual([
      "status",
      "Uploaded. Checking frames and images from the SWF; the link works in a minute or less…",
      undefined,
    ]);
    expect(waitUntilServed).toHaveBeenCalledWith(result.url, true);
    await vi.waitFor(() => expect(calls.at(-1)).toEqual(["status", "Live. The link works now.", "ok"]));
  });

  it.each([
    [422, "url_fetch_failed", "The link answered with HTTP 404.", "Upload failed: The link answered with HTTP 404."],
    [400, "url_not_allowed", "That address is not allowed.", "Upload failed: That address is not allowed."],
    [413, "too_large", "Over the 10 MiB limit for images.", "Upload failed: Over the 10 MiB limit for images."],
    [
      429,
      "rate_limited",
      "rate limit exceeded, retry later",
      "Too many uploads from your connection. Uploads from links have a lower hourly limit. Try again later.",
    ],
  ])("shows a %i %s error on the row", async (status, code, message, shown) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(status, { error: { code, message } })),
    );
    const { row, calls } = recordRow();

    await sendUrl("https://example.com/x.png", row, { hideName: false, slot, config });

    expect(calls.at(-1)).toEqual(["status", shown, "error"]);
  });

  it("reports a request that could not be sent as a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { row, calls } = recordRow();

    await sendUrl("https://example.com/x.png", row, { hideName: false, slot, config });

    expect(calls.at(-1)).toEqual(["status", "Network error. Check your connection and try again.", "error"]);
  });
});
