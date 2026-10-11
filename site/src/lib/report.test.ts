import { ForgeImagesError } from "@bitsocialforge/forge-images-client";
import { describe, expect, it } from "vitest";
import { describeReportFailure } from "./report";

describe("describeReportFailure", () => {
  it("shows the API message, or the status when there was no API error body", () => {
    expect(describeReportFailure(new ForgeImagesError(400, "bad_request", "url is not a Forge media URL"))).toBe(
      "Not sent: url is not a Forge media URL",
    );
    expect(describeReportFailure(new ForgeImagesError(502, "http_error", "HTTP 502 Bad Gateway"))).toBe(
      "Not sent (HTTP 502).",
    );
  });

  it("explains rate limits and network errors", () => {
    expect(describeReportFailure(new ForgeImagesError(429, "rate_limited", "Too many requests", 60))).toBe(
      "Too many reports from your connection. Try again later or email abuse@bitsocialforge.com.",
    );
    expect(describeReportFailure(new TypeError("Failed to fetch"))).toBe(
      "Network error. Try again, or email abuse@bitsocialforge.com.",
    );
  });
});
