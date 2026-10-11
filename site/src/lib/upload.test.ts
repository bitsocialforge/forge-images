import { describe, expect, it } from "vitest";
import { checkFile, classify, describeUploadFailure, formatSize } from "./upload";

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

describe("describeUploadFailure", () => {
  const body = (message: string) => ({ error: { code: "x", message } });

  it("explains rate limits and contradicting extensions", () => {
    expect(describeUploadFailure(429, body("slow down"))).toBe(
      "Too many uploads from your connection. Try again later.",
    );
    expect(describeUploadFailure(415, body("declared type contradicts the content"))).toMatch(
      /^The file's extension does not match its contents/,
    );
  });

  it("passes the API message through, with an HTTP fallback", () => {
    expect(describeUploadFailure(403, body("banned"))).toBe("Upload refused: banned");
    expect(describeUploadFailure(403, null)).toBe("Upload refused.");
    expect(describeUploadFailure(415, body("unsupported"))).toBe("Upload failed: unsupported");
    expect(describeUploadFailure(502, "<html>")).toBe("Upload failed (HTTP 502).");
  });
});
