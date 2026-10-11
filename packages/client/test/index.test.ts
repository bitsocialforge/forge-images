import { describe, expect, it, vi } from "vitest";
import { canonicalMediaUrl, ForgeImagesError, reportFile, uploadFile } from "../src/index.ts";

const SHA = "a".repeat(64);
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("uploadFile", () => {
  it("sends the Turnstile token before the file and returns the result", async () => {
    const result = {
      url: `https://forgeimg.net/${SHA}/cat.png`,
      sha256: SHA,
      size: 3,
      mime: "image/png",
      status: "pending",
    };
    const fetchMock = vi.fn(async () => json(200, result));
    const file = new File(["png"], "cat.png", { type: "image/png" });

    await expect(uploadFile(file, { turnstileToken: "tok", fetch: fetchMock })).resolves.toEqual(result);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://img-api.bitsocialforge.com/api/upload");
    expect(init.method).toBe("POST");
    expect(init.headers).toBeUndefined();
    expect([...(init.body as FormData).keys()]).toEqual(["turnstile", "file"]);
  });

  it("sends an empty filename field to leave the name out, and the API key as a bearer token", async () => {
    const fetchMock = vi.fn(async () =>
      json(200, {
        url: `https://forgeimg.net/${SHA}.png`,
        sha256: SHA,
        size: 1,
        mime: "image/png",
        status: "live",
      }),
    );

    await uploadFile(new Blob(["x"]), {
      apiKey: "k1",
      filename: null,
      apiOrigin: "http://127.0.0.1:3917/",
      fetch: fetchMock,
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:3917/api/upload");
    expect(init.headers).toEqual({ Authorization: "Bearer k1" });
    const form = init.body as FormData;
    expect([...form.keys()]).toEqual(["filename", "file"]);
    expect(form.get("filename")).toBe("");
  });

  it("requires a Turnstile token or an API key", async () => {
    await expect(uploadFile(new Blob(["x"]), { fetch: vi.fn() })).rejects.toThrow(TypeError);
  });

  it("throws ForgeImagesError with the API code, message, and Retry-After", async () => {
    const fetchMock = vi.fn(async () =>
      json(429, { error: { code: "rate_limited", message: "slow down" } }, { "Retry-After": "120" }),
    );

    const error = (await uploadFile(new Blob(["x"]), { turnstileToken: "t", fetch: fetchMock }).catch(
      (err: unknown) => err,
    )) as ForgeImagesError;

    expect(error).toBeInstanceOf(ForgeImagesError);
    expect(error.status).toBe(429);
    expect(error.code).toBe("rate_limited");
    expect(error.message).toBe("slow down");
    expect(error.retryAfterSeconds).toBe(120);
  });
});

describe("reportFile", () => {
  it("posts JSON and accepts 202", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));

    await reportFile({ url: `https://forgeimg.net/${SHA}.png`, reason: "illegal", detail: "x" }, { fetch: fetchMock });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://img-api.bitsocialforge.com/api/report");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      url: `https://forgeimg.net/${SHA}.png`,
      reason: "illegal",
      detail: "x",
    });
  });

  it("needs a url or sha256", async () => {
    await expect(reportFile({ reason: "other" }, { fetch: vi.fn() })).rejects.toThrow(TypeError);
  });
});

describe("canonicalMediaUrl", () => {
  it("maps named and canonical URLs to the canonical form", () => {
    expect(canonicalMediaUrl(`https://forgeimg.net/${SHA}/funny%20cat.PNG?x=1`)).toBe(
      `https://forgeimg.net/${SHA}.png`,
    );
    expect(canonicalMediaUrl(`https://forgeimg.net/${SHA}.webp`)).toBe(`https://forgeimg.net/${SHA}.webp`);
  });

  it("rejects other hosts and malformed paths", () => {
    expect(canonicalMediaUrl(`https://example.com/${SHA}.png`)).toBeNull();
    expect(canonicalMediaUrl("https://forgeimg.net/not-a-hash.png")).toBeNull();
    expect(canonicalMediaUrl(`https://forgeimg.net/${SHA}/.png`)).toBeNull();
  });
});
