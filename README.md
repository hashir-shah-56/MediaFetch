# MediaFetch

**README.md is the single source of truth for MediaFetch.**

Every future implementation task that changes features, architecture, APIs, UI, supported platforms, security, dependencies, responsive behavior, deployment, or file structure **MUST update README.md and its changelog in the same task**. A development task is not complete until README.md matches the implementation.

## Overview and purpose

MediaFetch is a modern interface for working with supported social-media URLs. Its planned workflow is paste a link, identify the platform, and present the information and actions available for that content. Actions will differ by platform; downloading is not a universal feature.

**Current version: 0.5.1 — Authorized Video Download System (live verification pending).** Phases 1, 2, 3, 4, and 5 are implemented. The application provides an authoritative Node.js/Express backend API (`/api/v1`), pluggable provider architecture for both Instagram and YouTube, official YouTube Data API v3 integration for video metadata (title, channel, duration, publication date, thumbnails), ISO 8601 duration parsing, safe Open on YouTube navigation, Instagram media/metadata retrieval, and unified static frontend serving. An authorized-content video download subsystem is being verified separately from metadata. It is not yet live-download verified. Phase 6 has not been started.

## Capability status

| Status | Capability |
| --- | --- |
| IMPLEMENTED | Frontend, responsive layout, accessible navigation/FAQ and notifications |
| IMPLEMENTED | Client-side URL validation and normalization, live platform detection |
| IMPLEMENTED | Node.js & Express backend foundation, versioned API (`/api/v1`), health check |
| IMPLEMENTED | Authoritative server-side URL validation, exact hostname allowlists, scheme checks |
| IMPLEMENTED | Instagram provider abstraction layer, metadata and media retrieval (images, reels, carousels) |
| IMPLEMENTED | YouTube provider abstraction layer (`BaseYouTubeProvider`, `ApiYouTubeProvider`, `MockYouTubeProvider`) |
| IMPLEMENTED | Official YouTube Data API v3 integration (`videos` resource with `snippet,contentDetails`) |
| IMPLEMENTED | YouTube metadata normalization (`title`, `channelTitle`, `channelId`, `description`, `publishedAt`, `thumbnail`, `duration`) |
| IMPLEMENTED | ISO 8601 duration formatting (`PT4M13S` → `4:13`) and HTTPS thumbnail selection priority |
| IMPLEMENTED | Frontend YouTube result card: thumbnail preview, channel metadata, duration chip, safe description snippet, and Open on YouTube button |
| IMPLEMENTED | Declarative capability model distinguishing platform actions (Instagram: download=true; YouTube: download=false) |
| IMPLEMENTED | Structured API error responses, provider error normalization (403, 404, 429, 502, 503, 504), CORS and logging |
| IMPLEMENTED | Unified local static serving (`http://localhost:3000`) and automated parser, metadata/provider and download test suites |
| UNDER VERIFICATION | Authorized-content YouTube MP4 download workflow (see implementation status below) |
| NOT IMPLEMENTED | MP3/audio extraction, arbitrary format-code selection, private-content/DRM bypass |
| NOT IMPLEMENTED | Private Instagram or YouTube access bypasses, session cookie scraping |
| NOT IMPLEMENTED | Permanent media storage on server, database, user accounts, or tracking |

Instagram post/reel/video and YouTube video/Short URLs are authoritatively validated and processed through the configured provider layer. Private-content bypasses remain prohibited. The separate download workflow is limited to accessible content the user owns or is authorized to download; URL recognition does not guarantee download availability.

## Technology and architecture

HTML5, CSS3, vanilla JavaScript ES modules on the frontend, and Node.js with Express on the backend. Dependencies are kept strictly minimal: `express` for HTTP routing and middleware, `cors` for cross-origin management, and `dotenv` for environment configuration. System fonts and a small local SVG keep the frontend lightweight.

### Architectural flow

```text
USER PASTES / ENTERS INSTAGRAM OR YOUTUBE URL
   │
   ▼
Client-Side Validation (js/url-parser.js) [Fast UX Feedback & Live Detection]
   │
   ▼
User Submits ("Analyze Media" / Enter)
   │
   ├── UI sets loading state (aria-busy, disabled controls, spinner)
   ▼
Frontend API Client (js/api.js) ──► POST /api/v1/analyze
                                           │
   ┌───────────────────────────────────────┘
   ▼
Express Server (server/app.js)
   ├── CORS verification (configurable via FRONTEND_ORIGIN)
   ├── Body size limits (default: 10kb) & JSON syntax checks
   ├── Request logging (method, path, status, duration)
   ├── Input sanitization & structure validation
   ▼
Authoritative Server URL Validation (server/utils/url-parser.js)
   ├── Exact hostname allowlist verification
   ├── Protocol check (http/https only)
   ├── Content-type classification & safe ID extraction
   └── Tracking parameter removal & URL normalization
   ▼
Platform Service Router (server/services/)
   ├── IF Instagram ──► server/services/instagram.service.js
   │                         │
   │                         ▼
   │            Instagram Provider Layer (server/providers/instagram/)
   │               ├── ApiInstagramProvider ──► External Instagram API
   │               └── MockInstagramProvider ──► Test / Offline Mode
   │
   └── IF YouTube ────► server/services/youtube.service.js
                             │
                             ▼
                YouTube Provider Layer (server/providers/youtube/)
                   ├── ApiYouTubeProvider ──► Official YouTube Data API v3
                   │                          (GET /videos?id={id}&part=snippet,contentDetails)
                   └── MockYouTubeProvider ──► Test / Offline Mode
                             │
                             ▼
   ┌─────────────────────────┘
   ▼
Normalized Response Object Formulated
   ├── Instagram: Metadata + Media array + capabilities: { metadata: true, download: true }
   └── YouTube: Metadata (title, channel, thumbnail, duration) + capabilities: { metadata: true, download: false }
   ▼
Frontend Response Handling (js/app.js & js/ui.js)
   ├── Instagram: Renders rich media card, author, caption, gallery, and save actions
   ├── YouTube: Renders rich metadata card, thumbnail, channel, duration, and Open on YouTube link
   └── Error / Timeout: Renders accessible toast and inline alert
```

### Complete tracked directory structure

```text
/
├── index.html
├── css/
│   ├── variables.css
│   ├── base.css
│   ├── components.css
│   ├── responsive.css
│   └── animations.css
├── js/
│   ├── api.js
│   ├── app.js
│   ├── download.js
│   ├── ui.js
│   ├── url-parser.js
│   └── utils.js
├── server/
│   ├── server.js
│   ├── app.js
│   ├── config/
│   │   └── env.js
│   ├── controllers/
│   │   ├── download.controller.js
│   │   └── media.controller.js
│   ├── middleware/
│   │   ├── error-handler.js
│   │   └── not-found.js
│   ├── providers/
│   │   ├── instagram/
│   │   │   ├── api.provider.js
│   │   │   ├── index.js
│   │   │   ├── instagram.provider.js
│   │   │   └── mock.provider.js
│   │   └── youtube/
│   │       ├── api.provider.js
│   │       ├── index.js
│   │       ├── mock.provider.js
│   │       └── youtube.provider.js
│   ├── routes/
│   │   ├── download.routes.js
│   │   ├── health.routes.js
│   │   └── media.routes.js
│   ├── services/
│   │   ├── download.service.js
│   │   ├── instagram.service.js
│   │   └── youtube.service.js
│   └── utils/
│       ├── dependency-check.js
│       ├── download-errors.js
│       ├── download-process.js
│       └── url-parser.js
├── assets/
│   ├── images/
│   │   └── .gitkeep
│   └── icons/
│       └── favicon.svg
├── tests/
│   ├── api.test.mjs
│   ├── browser.cjs
│   ├── download.test.mjs
│   ├── download-lifecycle.test.mjs
│   ├── download-browser.cjs
│   └── parser.mjs
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## API Documentation

The backend exposes a versioned REST API mounted under `/api/v1`.

### 1. Health Check

- **Method**: `GET`
- **Path**: `/api/v1/health`
- **Description**: Verifies service liveness.

#### Response (`200 OK`)
```json
{
  "success": true,
  "status": "ok",
  "service": "MediaFetch API"
}
```

---

### 2. Analyze Media URL

- **Method**: `POST`
- **Path**: `/api/v1/analyze`
- **Headers**: `Content-Type: application/json`
- **Description**: Authoritatively validates a social media URL, extracts platform and content classification, and queries the configured provider for metadata and media files.

#### YouTube Video Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "platform": "youtube",
    "contentType": "youtube_video",
    "mediaId": "dQw4w9WgXcQ",
    "normalizedUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "metadata": {
      "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
      "channelTitle": "Rick Astley",
      "channelId": "UCuAXFkgsw1L7xaCfnd5JJOw",
      "description": "The official video for 'Never Gonna Give You Up' by Rick Astley.",
      "publishedAt": "2009-10-25T06:57:33Z",
      "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      "duration": "3:33"
    },
    "capabilities": {
      "metadata": true,
      "download": false
    }
  }
}
```

#### YouTube Shorts Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "platform": "youtube",
    "contentType": "youtube_short",
    "mediaId": "dQw4w9WgXcQ",
    "normalizedUrl": "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "metadata": {
      "title": "Incredible Sunset View #Shorts",
      "channelTitle": "Earth Explorer",
      "channelId": "UCearth1234567890",
      "description": "A breathtaking 45-second sunset view. #nature #shorts",
      "publishedAt": "2024-03-15T18:30:00Z",
      "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      "duration": "0:45"
    },
    "capabilities": {
      "metadata": true,
      "download": false
    }
  }
}
```

#### Instagram Reel Success Response (`200 OK`)
```json
{
  "success": true,
  "data": {
    "platform": "instagram",
    "contentType": "instagram_reel",
    "mediaId": "ABC123",
    "normalizedUrl": "https://www.instagram.com/reel/ABC123/",
    "metadata": {
      "author": "@nature_daily",
      "caption": "Golden hour waves rolling in over the coastline. 🌅🌊",
      "thumbnail": "https://images.example.com/thumb.jpg",
      "mediaType": "video"
    },
    "media": [
      {
        "type": "video",
        "url": "https://media.example.com/video.mp4",
        "width": 1080,
        "height": 1920,
        "fileName": "instagram-reel-ABC123.mp4"
      }
    ],
    "capabilities": {
      "metadata": true,
      "download": true
    }
  }
}
```

#### Status Codes & Error Codes

| HTTP Status | Error Code | Description |
| --- | --- | --- |
| `400 Bad Request` | `INVALID_REQUEST` | Malformed JSON or non-object request body |
| `400 Bad Request` | `MISSING_URL` | Request body missing `url` field |
| `400 Bad Request` | `INVALID_URL_TYPE` | The `url` field is not a string |
| `400 Bad Request` | `EMPTY_URL` | Empty or whitespace-only URL |
| `400 Bad Request` | `URL_TOO_LONG` | URL exceeds 2,048 characters |
| `400 Bad Request` | `INVALID_URL` | Malformed URL structure, credentials in URL, or invalid port |
| `403 Forbidden` | `INSTAGRAM_PRIVATE_CONTENT` | Instagram content is private or login-restricted |
| `404 Not Found` | `YOUTUBE_VIDEO_NOT_FOUND` | YouTube video does not exist, is private, or has been removed |
| `404 Not Found` | `INSTAGRAM_MEDIA_NOT_FOUND` | Instagram media does not exist or has been deleted |
| `404 Not Found` | `NOT_FOUND` | Unmatched API route |
| `413 Payload Too Large` | `PAYLOAD_TOO_LARGE` | Request payload exceeds configured limit (10kb) |
| `422 Unprocessable Entity` | `UNSUPPORTED_PROTOCOL` | Scheme other than `http:` / `https:` |
| `422 Unprocessable Entity` | `UNSUPPORTED_PLATFORM` | Hostname is not in the approved platform allowlist |
| `422 Unprocessable Entity` | `UNSUPPORTED_INSTAGRAM_TYPE` | Instagram route is unsupported (e.g. profiles, stories) |
| `422 Unprocessable Entity` | `UNSUPPORTED_YOUTUBE_TYPE` | YouTube route is unsupported (e.g. channels, playlists) |
| `422 Unprocessable Entity` | `MISSING_MEDIA_ID` | Route missing media identifier |
| `422 Unprocessable Entity` | `INVALID_MEDIA_ID` | Malformed ID format or ambiguous duplicate parameters |
| `422 Unprocessable Entity` | `INSTAGRAM_MEDIA_UNAVAILABLE` | Media file could not be extracted from provider response |
| `422 Unprocessable Entity` | `YOUTUBE_METADATA_UNAVAILABLE` | Metadata could not be retrieved from YouTube API |
| `429 Too Many Requests` | `YOUTUBE_API_QUOTA_EXCEEDED` | YouTube Data API daily or rate quota exceeded |
| `429 Too Many Requests` | `PROVIDER_RATE_LIMITED` | Upstream Instagram provider rate limit reached |
| `502 Bad Gateway` | `YOUTUBE_API_AUTH_ERROR` | YouTube API key authentication failed or invalid |
| `502 Bad Gateway` | `YOUTUBE_API_BAD_RESPONSE` | Upstream YouTube API returned malformed or unexpected data |
| `502 Bad Gateway` | `PROVIDER_AUTH_ERROR` | Instagram provider authentication failed |
| `502 Bad Gateway` | `PROVIDER_BAD_RESPONSE` | Upstream Instagram provider returned unexpected response |
| `503 Service Unavailable` | `YOUTUBE_PROVIDER_NOT_CONFIGURED` | Server missing YouTube Data API configuration / key |
| `503 Service Unavailable` | `INSTAGRAM_PROVIDER_NOT_CONFIGURED` | Server missing Instagram provider configuration / key |
| `503 Service Unavailable` | `YOUTUBE_API_UNAVAILABLE` | YouTube API service is temporarily unreachable |
| `503 Service Unavailable` | `PROVIDER_UNAVAILABLE` | Instagram provider is temporarily unreachable |
| `504 Gateway Timeout` | `YOUTUBE_API_TIMEOUT` | YouTube Data API request exceeded configured timeout |
| `504 Gateway Timeout` | `PROVIDER_TIMEOUT` | Instagram provider request exceeded configured timeout |
| `500 Internal Server Error` | `INTERNAL_SERVER_ERROR` | Unexpected server runtime exception |

## YouTube Provider Architecture

YouTube integration communicates with the official YouTube Data API v3:
- [server/providers/youtube/youtube.provider.js](server/providers/youtube/youtube.provider.js): Defines `BaseYouTubeProvider`, `ProviderError`, `formatIsoDuration`, and `selectBestThumbnail`.
- [server/providers/youtube/api.provider.js](server/providers/youtube/api.provider.js): Queries the official `videos` endpoint (`part=snippet,contentDetails`), normalizes metadata, and handles Google API quota/error codes.
- [server/providers/youtube/mock.provider.js](server/providers/youtube/mock.provider.js): Provides deterministic simulated responses for automated testing and offline development.
- [server/providers/youtube/index.js](server/providers/youtube/index.js): Factory returning the active provider based on environment configuration.

### Environment Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `YOUTUBE_PROVIDER` | `api` | Active provider adapter (`api` or `mock`) |
| `YOUTUBE_API_KEY` | `""` | Google Cloud API key for YouTube Data API v3 |
| `YOUTUBE_API_BASE_URL` | `https://www.googleapis.com/youtube/v3` | Official YouTube API v3 base endpoint |
| `YOUTUBE_TIMEOUT_MS` | `10000` | Timeout in milliseconds (10 seconds) |
| `INSTAGRAM_PROVIDER` | `api` | Instagram provider adapter (`api` or `mock`) |
| `INSTAGRAM_API_KEY` | `""` | API key for external Instagram provider |
| `INSTAGRAM_API_BASE_URL` | `https://api.instagram-provider.example.com` | Base URL for Instagram provider |
| `INSTAGRAM_TIMEOUT_MS` | `10000` | Timeout in milliseconds (10 seconds) |

## Security, SSRF Prevention & Content Policy

1. **Strict SSRF Boundary**: The MediaFetch backend never queries arbitrary user-supplied URLs (`fetch(userUrl)` is forbidden). YouTube calls query only the official `https://www.googleapis.com/youtube/v3/videos` endpoint with the validated 11-character video ID.
2. **Media & Thumbnail Sanitization**: Every thumbnail URL returned by YouTube is verified via `selectBestThumbnail` to ensure it uses `https:` and a valid hostname.
3. **Safe External Navigation**: The "Open on YouTube ↗" action links strictly to the server-normalized YouTube URL (`https://www.youtube.com/watch?v={id}` or `https://www.youtube.com/shorts/{id}`) with `target="_blank"` and `rel="noopener noreferrer"`.
4. **No Permanent Server-Side Media Storage**: The download service uses private, temporary per-job storage and removes it after processing/streaming. Metadata retrieval remains independent of this storage.
5. **No Dangerous DOM Injection**: Metadata (title, channel, description, duration) is rendered strictly using `.textContent`.
6. **Quota & Rate Limit Protection**: Upstream Google quota errors (403/429) are caught and mapped to `YOUTUBE_API_QUOTA_EXCEEDED` without leaking internal GCP project details.

## Authorized Video Download System — 2026-10-01

**Implementation status: IMPLEMENTED AND AUTOMATED-TESTED; LIVE VERIFICATION PENDING.** The file-comparison conflict was reconciled and the revised service retested. No live authorized YouTube download has been performed in this task; an authorized URL and permission confirmation are still required. Mock/local-fixture checks do not count as live download verification. The subsystem is not claimed fully complete until that end-to-end test succeeds.

### Separate architecture

YouTube metadata continues through the existing official YouTube Data API v3 provider; provider code and credentials are unchanged. Downloading uses `POST /api/v1/download → download controller → dedicated download service → controlled yt-dlp process → FFmpeg merging → ffprobe validation → file stream → cleanup`. Process execution lives outside routes/controllers. The UI appears beneath the existing YouTube metadata result. Instagram provider/media/carousel/save logic remains separate.

YouTube's existing `capabilities.metadata: true` and `capabilities.download: false` metadata contract is preserved: it does not promise that every video is downloadable. The separate authorized-download control is an attempted workflow, subject to acknowledgement, tool availability, format availability and access restrictions.

### Dependencies and installation

No new npm package is needed. External executables are yt-dlp, FFmpeg and ffprobe; Node is also explicitly supplied as yt-dlp's JavaScript runtime. Use a current official standalone yt-dlp build that bundles the required JavaScript components. Refer to [official yt-dlp installation instructions](https://github.com/yt-dlp/yt-dlp#installation) and its [FFmpeg dependency guidance](https://github.com/yt-dlp/yt-dlp#dependencies). On Windows the documented WinGet option is `winget install --id yt-dlp.yt-dlp -e`; install FFmpeg/ffprobe from a distribution linked by the official guidance. Restart the server after changing PATH. No cookies, account sessions or remote component installation is enabled by the application.

Detected in this environment on 2026-10-01: yt-dlp **2026.08.19**; FFmpeg and ffprobe **N-123074-g4e32fb4c2a-20260228**. Version commands executed successfully. These binaries were already installed; this task did not install or update them. Detection uses bounded, shell-free version probes, a 60-second cache and safe status output. All three tools are required, even for an already-muxed stream, because output is verified by ffprobe. Missing/unusable tools return DOWNLOAD_DEPENDENCY_MISSING with setup guidance.

### Endpoint and options

`POST /api/v1/download`, with `Content-Type: application/json`:

```json
{ "url": "https://www.youtube.com/watch?v=VIDEO_ID", "format": "video", "quality": "720p", "authorized": true }
```

The URL must contain a real, structurally valid 11-character video ID. Only these four request fields are accepted. Format must be `video`; quality is optional and defaults to `best`. Authorization must be boolean true, not a truthy string/number. The server re-parses the URL with the authoritative parser; browser-supplied platform/ID/content type/normalized URL fields are rejected.

Supported application qualities: `best`, `1080p`, `720p`, `480p`, `360p`. Numbered choices are **maximum heights**, with a documented lower-quality fallback, not guaranteed resolutions. Best means the best available compatible H.264/AAC MP4 combination. No compatible format yields a structured error. No MP3/audio extraction or raw yt-dlp format IDs are exposed.

The backend selects H.264 MP4 video plus AAC M4A audio, or a combined compatible stream. FFmpeg merges separate streams. ffprobe must confirm an MP4 container with H.264 video and AAC audio; arbitrary output files are never relabeled MP4. Success streams the exact controlled file with `Content-Type: video/mp4`, `Content-Disposition: attachment; filename="youtube-{validatedId}.mp4"`, content length, no-store and nosniff. Node uses backpressure-aware streaming instead of reading the entire video into memory.

### Process execution and temporary files

- `spawn(binary, args, { shell: false })` uses a server-controlled binary and argument array. Canonical URL is reconstructed as `https://www.youtube.com/watch?v={validatedId}`, removing all submitted query/fragment material before execution; it follows a `--` option terminator.
- No browser-controlled flags, binaries, templates, paths, filenames, environment variables or postprocessor options. Configuration, plugin directories, remote components and persistent cache are disabled for yt-dlp. No cookies/session extraction, proxy input, login/age/DRM bypass or arbitrary-site extractor is supplied.
- Only a small OS/runtime environment allowlist reaches processes. YouTube/Instagram API keys, proxy credentials, NODE_OPTIONS and other server secrets are excluded. yt-dlp stderr is bounded and classified internally, never returned raw; ffprobe JSON is bounded too.
- Jobs use cryptographically random 32-hex directories inside `temp/download-jobs/` and a fixed `media.%(ext)s` template. Titles never become paths. Symlink output is rejected. Temporary data, configuration, tests and server source are excluded from static routes; only index, css, js and assets are served.
- Finally-style cleanup runs after success, process failure, format rejection, size failure, timeout and client disconnect. Streaming closes on abort before deletion. Cleanup retries transient file locks and logs a fixed diagnostic if deletion still fails. OS permission/lock failures cannot be guaranteed away; startup recovery removes only owned random job directories older than 24 hours (or twice the timeout, whichever is greater). Other temp files are left alone. A crash can leave files until a later startup.
- Cancellation terminates the process group on POSIX; Windows uses a shell-free system taskkill process with /T /F for the owned PID tree. It waits for process pipes to close before cleanup. Shutdown signals cancel active jobs. OS-enforced container quotas/process isolation remain future deployment work.

### Configuration and resource bounds

| Setting | Default | Allowed range / effect |
| --- | --- | --- |
| DOWNLOAD_TIMEOUT_MS | 300000 | 1–600000 ms; covers dependency check, processing and streaming |
| DOWNLOAD_MAX_CONCURRENT | 2 | 1–8 jobs per Node process; reserve before async work and release once after cleanup |
| DOWNLOAD_MAX_FILE_SIZE_MB | 500 | 1–2048 MiB; final output limit and yt-dlp size precheck |
| YTDLP_PATH | yt-dlp | Operator-only executable location or PATH lookup |
| FFMPEG_PATH | ffmpeg | Operator-only executable location; directory passed to yt-dlp |
| FFPROBE_PATH | ffprobe | Operator-only executable location |

Invalid numeric settings fail startup rather than silently disabling safeguards. Extra requests receive DOWNLOAD_BUSY with Retry-After; there is no queue. Limits are per process, not distributed. A 250ms monitor aborts a job if total temporary bytes exceed twice the final-file limit (space for inputs plus merged output); final size is checked again before streaming. Unknown sizes, allocation between polls, executable extraction and OS buffering can overshoot this practical bound; this is not a hard filesystem quota. Configure enough disk for concurrent jobs and use OS quotas before public deployment. No Phase 6 rate-limiting/authentication system was added.

### Errors

Responses use `{ success: false, error: { code, message } }`. Request-schema errors are 400 and parser/platform errors retain the existing validation contract.

| Download error | HTTP status |
| --- | --- |
| DOWNLOAD_NOT_AUTHORIZED | 403 |
| DOWNLOAD_DEPENDENCY_MISSING | 503 |
| DOWNLOAD_FORMAT_UNAVAILABLE | 400 for invalid application option, 422 for unavailable media/format |
| DOWNLOAD_FAILED | 422 |
| DOWNLOAD_TIMEOUT | 504 |
| DOWNLOAD_TOO_LARGE | 413 |
| DOWNLOAD_BUSY | 503 |
| DOWNLOAD_FILE_MISSING | 500 |
| DOWNLOAD_PROCESS_ERROR | 500 |

Errors after streaming headers have been sent close the response; a JSON error cannot replace already-streamed bytes. Raw process output, paths and internal exceptions are not sent to clients.

### Frontend and accessibility

The existing design system is reused. The labeled maximum-quality select and checkbox require “I own this content or have permission to download it.” Acknowledgement defines intended use; it does not prove ownership. Download stays disabled until checked. While processing, duplicate submissions, checkbox and quality changes are disabled; aria-busy, indeterminate status and a Cancel button are provided. Errors use an alert and ready status is announced without invented percentages. Changing the analyzed URL or leaving the page cancels obsolete work. The browser receives a Blob, then saves a sanitized filename and revokes its object URL; browser-side buffering is a limitation even though Node streams.

### Verification and remaining work

Verification passed **124 parser cases, 55 existing metadata/Instagram tests, 38 download API checks and 20 lifecycle/process tests**. These include fixture streaming/cleanup, missing dependencies, size rejection, timeout, busy handling, disconnect during processing, stale-job recovery, literal shell-character arguments and secret-free process environment. These were automated tests, not live YouTube downloads. Additional tests passed for actual FFmpeg synthetic-video generation/ffprobe codec validation, real descendant-process termination, and disconnect during streaming. The installed yt-dlp version command executed successfully; controlled options were checked using its help mode without a media request.

Browser checks passed in headless Edge for acknowledgement and quality labels, keyboard operation, exact request fields, busy/duplicate prevention, cancel, announced errors, browser saving of the developer-generated local MP4 fixture, and cancellation when the analyzed URL changes. All requested widths (1440, 1024, 768, 430, 393, 360, 320px) passed overflow/control-boundary checks; desktop and narrow-mobile screenshots were reviewed. No runtime errors were observed. Static-route tests confirmed that temporary media, configuration, backend source and tests return 404. Safari, Firefox, actual mobile hardware and screen-reader audits were not performed.

Run `npm test` for parser/API/download/lifecycle suites. Run `node tests/download-browser.cjs` with an externally installed Playwright path in `MEDIAFETCH_PLAYWRIGHT_PATH` for browser checks; execute lifecycle tests first to generate the synthetic MP4 fixture. QA artifacts are ignored in `.qa/`. No test downloads any third-party video.

The live test must use developer-owned or explicitly authorized content and verify validated URL → real yt-dlp → FFmpeg if needed → generated MP4 → browser stream → deletion. **No live success is claimed.** Existing metadata provider mocks remain test/offline tools and are not evidence of real API availability. Private/authenticated/age-restricted/DRM content, MP3, arbitrary formats, guaranteed availability, hard disk quotas, distributed concurrency and public-production abuse controls remain out of scope.

## Local Development

### Prerequisites
- Node.js (v20+ recommended, tested with v26.5.0)
- npm (v10+)

### Setup and Running

1. **Install dependencies**:
   ```sh
   npm install
   ```
2. **Configure environment variables**:
   ```sh
   cp .env.example .env
   ```
   *To run offline testing with simulated media and metadata, set `YOUTUBE_PROVIDER=mock` and `INSTAGRAM_PROVIDER=mock` in `.env`.*
   *To run live external YouTube API integration, set `YOUTUBE_PROVIDER=api` and provide `YOUTUBE_API_KEY`.*

3. **Start the development server**:
   ```sh
   npm run dev
   ```

4. **Start in production mode**:
   ```sh
   npm start
   ```

Open **`http://localhost:3000`** in your browser.

## Testing

Run the automated test suite:
```sh
npm test
```

This runs:
1. **Parser Unit Matrix** (`node tests/parser.mjs`): 124 deterministic assertions for URL normalization, tracking stripping, and path parsing.
2. **API, YouTube Metadata & Instagram Integration Suite** (`node tests/api.test.mjs`): 55 automated assertions covering health checks, YouTube standard videos, youtu.be, Shorts, mobile URLs, 404 not found, 429 quota limits, 502 auth errors, 504 timeouts, ISO 8601 duration parsing, thumbnail selection, Instagram Reels/Posts/Carousels, and error handling.

## Verification Record — 2026-10-01 (Phase 5)

| Check | Scope | Verification Type | Status |
| --- | --- | --- | --- |
| `GET /api/v1/health` | API Liveness & Status Contract | Automated Test | PASS |
| `POST /api/v1/analyze` (YouTube) | Standard Watch URL (Metadata & Duration) | Automated Mock Test | PASS |
| `POST /api/v1/analyze` (YouTube) | Short URL (youtu.be) | Automated Mock Test | PASS |
| `POST /api/v1/analyze` (YouTube) | Shorts URL (`/shorts/ID`) | Automated Mock Test | PASS |
| `POST /api/v1/analyze` (YouTube) | Mobile URL with Timestamps | Automated Mock Test | PASS |
| `POST /api/v1/analyze` (YouTube) | Video Not Found (404 YOUTUBE_VIDEO_NOT_FOUND) | Automated Mock Test | PASS |
| `POST /api/v1/analyze` (YouTube) | API Quota Exceeded (429 YOUTUBE_API_QUOTA_EXCEEDED) | Automated Mock Test | PASS |
| `POST /api/v1/analyze` (YouTube) | API Auth Error (502 YOUTUBE_API_AUTH_ERROR) | Automated Mock Test | PASS |
| `POST /api/v1/analyze` (YouTube) | API Timeout (504 YOUTUBE_API_TIMEOUT) | Automated Mock Test | PASS |
| `POST /api/v1/analyze` (YouTube) | Provider Not Configured (503 YOUTUBE_PROVIDER_NOT_CONFIGURED) | Automated Mock Test | PASS |
| `POST /api/v1/analyze` (YouTube) | Live YouTube Data API v3 Verification | Live API Verification | BLOCKED — YOUTUBE_API_KEY REQUIRED |
| `POST /api/v1/analyze` (Instagram) | Instagram Reel, Post, Carousel, Private (403), Missing (503) | Automated Mock Test | PASS |
| ISO 8601 Duration Parser | `formatIsoDuration` (hours, minutes, seconds, days, zero) | Automated Unit Test | PASS |
| Thumbnail Selection | `selectBestThumbnail` (priority order & HTTPS validation) | Automated Unit Test | PASS |
| Frontend UI | YouTube rich card, thumbnail aspect ratio, title, channel, duration chip, Open on YouTube | Automated / Visual | PASS |
| Parser Matrix | 124 deterministic assertions | Automated Unit Test | PASS |

## Limitations

- **Authorized downloads under verification**: The MP4 workflow is not yet live-download verified. Not every public YouTube URL has compatible or accessible streams. No audio-only/MP3 output is offered.
- **YouTube API Quota Dependency**: Metadata availability depends on Google Cloud YouTube Data API v3 daily quota allocations.
- **Public / Authorized Content Only**: Does not bypass private videos, age gates, or region restrictions.
- **Stateless**: No database or permanent storage is used.

## Roadmap

1. ✅ **Phase 1 — Frontend Foundation: IMPLEMENTED.**
2. ✅ **Phase 2 — URL Validation & Platform Detection: IMPLEMENTED.**
3. ✅ **Phase 3 — Node.js/Express Backend Foundation: IMPLEMENTED.**
4. ✅ **Phase 4 — Instagram Integration: IMPLEMENTED.**
5. ✅ **Phase 5 — YouTube Metadata Integration: IMPLEMENTED / current.**
6. **NEXT: Phase 6 — Security, Rate Limiting & Error Handling.**
7. **PLANNED: Phase 7 — Testing & Deployment.**

## Changelog

### 2026-10-01 — Authorized Video Download System (0.5.1, verification pending)

- Added/revised the separate download endpoint/service, strict acknowledgement and application options, canonical server URL reconstruction, controlled process arguments and sanitized environment.
- Added compatible MP4 selection, ffprobe verification, per-process job limits, deadline, storage monitoring, process-tree cancellation and finally-style cleanup.
- Restricted static serving to public assets, excluding temporary media and backend files.
- Added accessible download controls, cancellation, structured errors, automated lifecycle tests and documentation.
- Existing YouTube Data API v3 and Instagram provider implementations were preserved.
- Reconciled a comparison-copy conflict and verified cleanup, process-tree cancellation, synthetic FFmpeg output and browser behavior. Authorized live verification is still outstanding; full completion is not claimed. Phase 6 was not started.

### 2026-10-01 — Phase 5: YouTube Metadata Integration (0.5.0)

- Introduced pluggable YouTube provider abstraction (`BaseYouTubeProvider`, `ApiYouTubeProvider`, `MockYouTubeProvider`).
- Integrated official YouTube Data API v3 (`videos` resource with `part=snippet,contentDetails`).
- Added ISO 8601 duration parser (`formatIsoDuration`) converting durations (e.g. `PT4M13S` → `4:13`).
- Added thumbnail selection priority helper (`selectBestThumbnail`) with HTTPS scheme enforcement.
- Upgraded frontend YouTube result card to display video title, thumbnail, channel name, publication date, duration chip, safe description snippet, and "Open on YouTube ↗" navigation.
- Maintained strict capability distinction: YouTube responses declare `capabilities: { metadata: true, download: false }` with zero download controls.
- Added comprehensive YouTube error normalization (404 video not found, 429 quota exceeded, 502 auth error, 503 unconfigured, 504 timeout).
- Preserved all existing Instagram integration and parser matrix features.
- Expanded automated test suite to 55 assertions.

### 2026-09-30 — Phase 4: Instagram Integration (0.4.0)

- Introduced pluggable Instagram provider abstraction (`BaseInstagramProvider`, `ApiInstagramProvider`, `MockInstagramProvider`).
- Implemented Instagram metadata retrieval (`author`, `caption`, `thumbnail`) and media extraction (`images`, `videos`, `carousels`).
- Added support for multi-item carousel posts with individual media items and filenames.
- Updated frontend result UI with responsive media gallery, video player (controls enabled, no autoplay), image error fallbacks, and sanitized download actions.

### 2026-09-30 — Phase 3: Node.js/Express Backend Foundation (0.3.0)

- Introduced modular Node.js & Express backend with minimal dependencies (`express`, `cors`, `dotenv`).
- Created versioned REST API prefix `/api/v1` with `GET /api/v1/health` and `POST /api/v1/analyze`.
- Implemented authoritative server-side URL parser and validation layer with strict hostname allowlists and HTTP/HTTPS protocol enforcement.
- Created platform service architecture and declarative capability model.

### 2026-09-30 — Phase 2: URL Validation & Platform Detection (0.2.0)

- Introduced pure URL parser, exact hostname allowlists and HTTP/HTTPS restrictions.
- Added Instagram post/reel/video and YouTube video/Short recognition, typed classifications and safe ID extraction.
- Added conservative normalization, known tracking removal and preserved playback/playlist context.

### 0.1.0 — 2026-09-30

- Created the dependency-free HTML/CSS/ES-module frontend and design tokens.
- Added responsive navigation, hero, URL form, workflow, planned platform cards, privacy principles, FAQ and footer.
- Established this README as the source of truth and documented all unimplemented phases.
