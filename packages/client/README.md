# @bitsocialforge/forge-images-client

Upload and report client for [Forge Images](https://images.bitsocialforge.com), the free media host by
Bitsocial Forge. Dependency-free; works in browsers and Node 22+. The API contract is in
[docs/API.md](../../docs/API.md).

```ts
import { uploadFile, reportFile, canonicalMediaUrl, ForgeImagesError } from "@bitsocialforge/forge-images-client";

// Anonymous upload: get a fresh Cloudflare Turnstile token for each file first.
const result = await uploadFile(file, { turnstileToken });
// result.status === "pending" means the URL returns 404 until moderation approves it.

// Integration key instead of Turnstile; leave the filename out of the URL.
await uploadFile(blob, { apiKey, filename: null });

await reportFile({ url: result.url, reason: "illegal" });

canonicalMediaUrl(result.url); // https://img.bitsocialforge.com/<sha256>.<ext>
```

Errors from the API throw `ForgeImagesError` with `status`, `code`, `message`, and `retryAfterSeconds` for
`429`.

Not published to npm yet.

## License

MIT
