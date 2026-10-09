# Forge Images API

The public contract for uploading to and reporting files on Forge Images. Use it directly or through
[`@bitsocialforge/forge-images-client`](../packages/client/README.md).

- **API origin:** `https://img-api.bitsocialforge.com`
- **Media origin:** `https://img.bitsocialforge.com`

Everything except the upload body is JSON. There are no cookies or sessions.

## CORS

Every API route and the media origin answer browsers from any origin:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, HEAD, POST, OPTIONS`
- `Access-Control-Allow-Headers: Authorization, Content-Type`
- `Access-Control-Max-Age: 86400`

Never send credentials mode; nothing is cookie-authenticated.

## Access modes

| Mode | How | Notes |
|---|---|---|
| Anonymous | A Cloudflare Turnstile token in the `turnstile` field, one per upload | Turnstile widgets only issue tokens on allowed hostnames |
| Integration | `Authorization: Bearer <key>` header | Free keys for client integrations. No Turnstile; separate limits. Keys are never sold and buy no priority |

Uploads are rate-limited per IP (anonymous) or per key (integration).

## POST /api/upload

`multipart/form-data` with these parts:

| Part | Required | Notes |
|---|---|---|
| `turnstile` (text) | Anonymous uploads | Send it **before** the file part, so a bad token is rejected without reading the file |
| `filename` (text) | No | Name shown in the URL; overrides the file part's filename. Send it empty to get the canonical URL without a name |
| `file` (file) | Yes | One file per request |

The type is decided by the file's contents (magic bytes), never by its name or declared type. A declared type
that contradicts the contents is rejected.

| Type | Anonymous limit | Notes |
|---|---|---|
| JPEG, PNG, WebP | 10 MiB | EXIF, GPS, XMP, IPTC and comments are removed; the rotation tag is kept |
| GIF | 20 MiB | Stored as uploaded |
| MP4, WebM | 50 MiB, 10 minutes | Remuxed without re-encoding: container metadata removed, MP4 moov atom moved to the front for streaming, only the first video and audio tracks kept. WebM must use VP8/VP9/AV1 video and Vorbis/Opus audio |
| SWF (FWS, CWS) | 20 MiB | Stored as uploaded; every new SWF is reviewed by a person before it serves. LZMA (ZWS) is rejected |

Integration limits are higher. Response `200`:

```json
{
  "url": "https://img.bitsocialforge.com/9f86d081…0015ad/photo.jpg",
  "sha256": "9f86d081…0015ad",
  "size": 482113,
  "mime": "image/jpeg",
  "status": "pending"
}
```

- `sha256` names the **stored** bytes. For images it usually differs from your original file because metadata
  is removed. Use the returned value.
- `status: "live"`: the URL serves now (for example, the same file was already approved).
- `status: "pending"`: the URL returns 404 until moderation approves it. That takes seconds for images and up
  to about a minute for videos (sampled frames are checked); a file
  held for a person (and every new SWF) can take hours. Poll the URL with backoff; 404 responses during this
  window are not cached.

## Media URLs

| Form | Example |
|---|---|
| Canonical | `https://img.bitsocialforge.com/<sha256>.<ext>` |
| Named | `https://img.bitsocialforge.com/<sha256>/<name>.<ext>` |

Both forms serve the same file. Only the hash and the extension matter; the name is cosmetic. Files do not
expire. Identical files share one hash and one stored copy.

## POST /api/report

```json
{ "url": "https://img.bitsocialforge.com/<sha256>/photo.jpg", "reason": "illegal", "detail": "optional text" }
```

Send `url` (either form) or `sha256`. `reason` is one of `csam`, `illegal`, `dmca`, `other`. The answer is always
`202 {"ok": true}`, whether or not the file exists. Reports are rate-limited per IP and trigger an automatic
re-check. A formal copyright takedown needs a DMCA notice (see the site's legal page); urgent reports should also
go to `abuse@bitsocialforge.com`, which a person reads.

## Health probes

Both return the same 1×1 PNG, so clients can probe availability with an `<img>`:

- `GET https://img-api.bitsocialforge.com/health.png`: the upload API is healthy (`503` with a JSON body
  otherwise; `Cache-Control: no-store`).
- `GET https://img.bitsocialforge.com/2aa4fa20701cdd6d8d56046069001186b5267e3ee7d0ef618ad2f4a683723e11.png`: the
  media origin serves.

## Errors

Every error is `{"error": {"code": "...", "message": "..."}}` with a matching status.

| Status | Code | Meaning |
|---|---|---|
| 400 | `bad_request` | Malformed multipart, missing file, or an invalid file container |
| 401 | `bad_key` | The `Authorization` key is invalid or revoked |
| 403 | `turnstile_failed` | Missing or invalid Turnstile token |
| 403 | `banned` | The IP or key is banned |
| 413 | `too_large` | Over the limit for the type and access mode |
| 415 | `unsupported_type` | Type not accepted, or the declared type contradicts the contents |
| 429 | `rate_limited` | Includes a `Retry-After` header in seconds |
| 451 | `blocked` | This exact file is blocked |
| 503 | `storage_unavailable` | Uploads fail closed while storage is unreachable; retry later |
