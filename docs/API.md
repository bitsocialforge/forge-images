# Forge Images API

The public contract for uploading to and reporting files on Forge Images. Use it directly or through
[`@bitsocialforge/forge-images-client`](../packages/client/README.md).

- **API origin:** `https://img-api.bitsocialforge.com`
- **Media origin:** `https://forgeimg.net`

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

Uploads are rate-limited per IP (anonymous) or per key (integration). Uploads by URL also count against a lower
hourly limit per client IP, in both modes.

## POST /api/upload

`multipart/form-data` with these parts:

| Part | Required | Notes |
|---|---|---|
| `turnstile` (text) | Anonymous uploads | Send it **before** the `file` or `url` part, so a bad token is rejected without reading the file or fetching the link |
| `filename` (text) | No | Name shown in the URL; overrides the file part's filename or the name taken from the link (below). Send it empty to get the canonical URL without a name |
| `file` (file) | One of `file` or `url` | One file per request |
| `url` (text) | One of `file` or `url` | An absolute `http` or `https` link the API downloads the file from. Send it after the other text fields |

Send exactly one of `file` and `url`; both or neither is `400 bad_request`.

With `url`, the API downloads the file from its own address and then treats it exactly like an uploaded file: same
types, size limits, moderation, response, and pending behavior. A client cannot check a linked file's size or type
before sending; the API enforces both (`413`, `415`). The download:

- Accepts `http` and `https` links of at most 2048 characters, without a username or password, on the scheme's
  default port.
- Refuses links whose host resolves to a private or internal address, and follows at most 3 redirects, each checked
  the same way.
- Needs a `2xx` answer and must finish within 60 seconds. The remote `Content-Type` is ignored.
- Sends no cookies and nothing from your request; the remote server sees the API's address, not yours.
- Names the file, unless `filename` is sent, from the response's `Content-Disposition` filename, or else the last
  path segment of the final URL.

The API does not store the link.

The type is decided by the file's contents (magic bytes), never by its name or declared type. A declared type
that contradicts the contents is rejected.

| Type | Anonymous limit | Notes |
|---|---|---|
| JPEG, PNG, WebP | 10 MiB | EXIF, GPS, XMP, IPTC and comments are removed; the rotation tag is kept |
| GIF | 20 MiB | Stored as uploaded |
| MP4, WebM | 50 MiB, 10 minutes | Remuxed without re-encoding: container metadata removed, MP4 moov atom moved to the front for streaming, only the first video and audio tracks kept. WebM must use VP8/VP9/AV1 video and Vorbis/Opus audio. An MP4 with VP9 video is stored and returned as WebM (`video/webm`, `.webm` URL), because iPhone Safari cannot play VP9 from an MP4; its audio is encoded to Opus unless it already is Opus or Vorbis |
| SWF (FWS, CWS) | 20 MiB | Stored as uploaded; every new SWF is reviewed by a person before it serves. LZMA (ZWS) is rejected |

Integration limits are higher. Response `200`:

```json
{
  "url": "https://forgeimg.net/9f86d081…0015ad/photo.jpg",
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
| Canonical | `https://forgeimg.net/<sha256>.<ext>` |
| Named | `https://forgeimg.net/<sha256>/<name>.<ext>` |

Both forms serve the same file. Only the hash and the extension matter; the name is cosmetic. Files do not
expire. Identical files share one hash and one stored copy.

## POST /api/report

```json
{ "url": "https://forgeimg.net/<sha256>/photo.jpg", "reason": "illegal", "detail": "optional text" }
```

Send `url` (either form) or `sha256`. `reason` is one of `csam`, `illegal`, `dmca`, `other`. The answer is always
`202 {"ok": true}`, whether or not the file exists. Reports are rate-limited per IP and trigger an automatic
re-check. A formal copyright takedown needs a DMCA notice (see the site's legal page); urgent reports should also
go to `abuse@bitsocialforge.com`, which a person reads.

## Health probes

Both return the same 1×1 PNG, so clients can probe availability with an `<img>`:

- `GET https://img-api.bitsocialforge.com/health.png`: the upload API is healthy (`503` with a JSON body
  otherwise; `Cache-Control: no-store`).
- `GET https://forgeimg.net/2aa4fa20701cdd6d8d56046069001186b5267e3ee7d0ef618ad2f4a683723e11.png`: the
  media origin serves.

## Errors

Every error is `{"error": {"code": "...", "message": "..."}}` with a matching status. Branch on `code`; `message` is
short text suitable to show the uploader, not a stable contract.

| Status | Code | Meaning |
|---|---|---|
| 400 | `bad_request` | Malformed multipart, neither or both of `file` and `url`, or an invalid file container |
| 400 | `invalid_url` | The `url` field is not a valid `http` or `https` link, has a username or password, uses a non-default port, or is over 2048 characters |
| 400 | `url_not_allowed` | The link, or a redirect, points to a private or internal address, or redirects to a link that would be `invalid_url` |
| 401 | `bad_key` | The `Authorization` key is invalid or revoked |
| 403 | `turnstile_failed` | Missing or invalid Turnstile token |
| 403 | `banned` | The IP or key is banned |
| 413 | `too_large` | Over the limit for the type and access mode |
| 415 | `unsupported_type` | Type not accepted, or the declared type contradicts the contents |
| 422 | `url_fetch_failed` | The linked file could not be downloaded: DNS, connection, or TLS failure, a non-`2xx` answer, too many redirects, a timeout, or a broken transfer |
| 429 | `rate_limited` | Includes a `Retry-After` header in seconds |
| 451 | `blocked` | This exact file is blocked |
| 503 | `storage_unavailable` | Uploads fail closed while storage is unreachable; retry later |
