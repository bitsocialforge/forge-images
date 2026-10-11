import { ForgeImagesError } from "@bitsocialforge/forge-images-client";

/** The report form's message for a failed `reportFile` call. */
export function describeReportFailure(error: unknown): string {
  if (!(error instanceof ForgeImagesError)) return "Network error. Try again, or email abuse@bitsocialforge.com.";
  if (error.status === 429) {
    return "Too many reports from your connection. Try again later or email abuse@bitsocialforge.com.";
  }
  // The client falls back to the `http_error` code when the response had no API error body.
  return error.code !== "http_error" && error.message
    ? `Not sent: ${error.message}`
    : `Not sent (HTTP ${error.status}).`;
}
