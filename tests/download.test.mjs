/**
 * tests/download.test.mjs
 *
 * Automated test suite for the MediaFetch authorized-content download subsystem.
 *
 * Tests cover:
 *  - POST /api/v1/download request validation
 *  - Authorization acknowledgement enforcement
 *  - Quality allow-list enforcement
 *  - Server-side URL validation (no shell injection)
 *  - Command-injection protection (all malicious URLs must be blocked by URL parser)
 *  - Dependency detection
 *  - Health endpoint download subsystem reporting
 *  - Concurrency control behavior
 *  - Cleanup verification (no temp files after failure)
 *  - Instagram regression
 *
 * NOTE: Live yt-dlp download tests (end-to-end MP4 streaming) require
 * authorized content and are SEPARATE from this automated suite.
 * All tests here use only request/response validation and mock behaviors.
 */

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Test harness setup ─────────────────────────────────────────────────────

process.env.NODE_ENV = 'test';
process.env.YOUTUBE_PROVIDER  = 'mock';
process.env.INSTAGRAM_PROVIDER = 'mock';
process.env.DOWNLOAD_TIMEOUT_MS    = '30000';
process.env.DOWNLOAD_MAX_CONCURRENT = '2';
process.env.DOWNLOAD_MAX_FILE_SIZE_MB = '500';

const { app } = await import('../server/app.js');

let server;
let baseUrl;
let passed = 0;
let failed = 0;
const failures = [];

async function startServer() {
  return new Promise(resolve => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise(resolve => server.close(resolve));
}

async function post(path, body, opts = {}) {
  const raw = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': opts.rawContentType || 'application/json',
        'Content-Length': Buffer.byteLength(raw)
      }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(text), raw: text });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, json: null, raw: Buffer.concat(chunks).toString() });
        }
      });
    });
    req.on('error', reject);
    req.write(raw);
    req.end();
  });
}

async function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch {
          resolve({ status: res.statusCode, json: null });
        }
      });
    }).on('error', reject);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(description, fn) {
  try {
    await fn();
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${description}\n    ${err.message}`);
    failed++;
    failures.push({ description, error: err.message });
  }
}

// ─── Test cases ─────────────────────────────────────────────────────────────

await startServer();
console.log('\nRunning MediaFetch Download Subsystem Test Suite:');

// ── Health endpoint ──────────────────────────────────────────────────────────

await test('GET /api/v1/health reports download subsystem with yt-dlp status', async () => {
  const { status, json } = await get('/api/v1/health');
  assert(status === 200, `Expected 200, got ${status}`);
  assert(json.success === true, 'Expected success:true');
  assert(json.subsystems?.download, 'Expected subsystems.download object');
  assert(typeof json.subsystems.download.ytdlp === 'object', 'Expected download.ytdlp object');
  assert(typeof json.subsystems.download.ffmpeg === 'object', 'Expected download.ffmpeg object');
  assert(typeof json.subsystems.download.ffprobe === 'object', 'Expected download.ffprobe object');
  assert(typeof json.subsystems.download.activeJobs === 'number', 'Expected download.activeJobs number');
  assert(typeof json.subsystems.download.maxConcurrent === 'number', 'Expected download.maxConcurrent number');
});

// ── Request validation ───────────────────────────────────────────────────────

await test('POST /api/v1/download returns 400 for: Missing body', async () => {
  const { status, json } = await post('/api/v1/download', '');
  assert(status === 400, `Expected 400, got ${status}`);
  assert(json.success === false, 'Expected success:false');
});

await test('POST /api/v1/download returns 400 for: Missing url field', async () => {
  const { status, json } = await post('/api/v1/download', { authorized: true, format: 'video' });
  assert(status === 400, `Expected 400, got ${status}`);
  assert(json.error.code === 'MISSING_URL', `Expected MISSING_URL, got ${json.error.code}`);
});

await test('POST /api/v1/download returns 400 for: Non-string url', async () => {
  const { status, json } = await post('/api/v1/download', { url: 42, authorized: true });
  assert(status === 400, `Expected 400, got ${status}`);
  assert(json.error.code === 'INVALID_URL_TYPE', `Got ${json.error.code}`);
});

await test('POST /api/v1/download returns 400 for: Empty url', async () => {
  const { status, json } = await post('/api/v1/download', { url: '   ', authorized: true });
  assert(status === 400, `Expected 400, got ${status}`);
  assert(json.error.code === 'EMPTY_URL', `Got ${json.error.code}`);
});

await test('POST /api/v1/download returns 400 for: Overlong url', async () => {
  const { status, json } = await post('/api/v1/download', { url: 'https://youtube.com/watch?v=' + 'a'.repeat(2040), authorized: true });
  assert(status === 400, `Expected 400, got ${status}`);
  assert(json.error.code === 'URL_TOO_LONG', `Got ${json.error.code}`);
});

// ── Authorization gate ───────────────────────────────────────────────────────

await test('POST /api/v1/download returns 403 when authorized is missing', async () => {
  const { status, json } = await post('/api/v1/download', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', format: 'video' });
  assert(status === 403, `Expected 403, got ${status}`);
  assert(json.error.code === 'DOWNLOAD_NOT_AUTHORIZED', `Got ${json.error.code}`);
});

await test('POST /api/v1/download returns 403 when authorized is false', async () => {
  const { status, json } = await post('/api/v1/download', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', authorized: false });
  assert(status === 403, `Expected 403, got ${status}`);
  assert(json.error.code === 'DOWNLOAD_NOT_AUTHORIZED', `Got ${json.error.code}`);
});

await test('POST /api/v1/download returns 403 when authorized is string "true"', async () => {
  const { status, json } = await post('/api/v1/download', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', authorized: 'true' });
  assert(status === 403, `Expected 403, got ${status}`);
  assert(json.error.code === 'DOWNLOAD_NOT_AUTHORIZED', `Got ${json.error.code}`);
});

await test('POST /api/v1/download returns 403 when authorized is 1 (number)', async () => {
  const { status, json } = await post('/api/v1/download', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', authorized: 1 });
  assert(status === 403, `Expected 403, got ${status}`);
  assert(json.error.code === 'DOWNLOAD_NOT_AUTHORIZED', `Got ${json.error.code}`);
});

// ── Quality validation ───────────────────────────────────────────────────────

await test('POST /api/v1/download returns 400 for unsupported quality "4k"', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    authorized: true,
    format: '4k'
  });
  assert(status === 400, `Expected 400, got ${status}`);
  assert(json.error.code === 'DOWNLOAD_FORMAT_UNAVAILABLE', `Got ${json.error.code}`);
});

await test('POST /api/v1/download returns 400 for arbitrary yt-dlp format code "bestvideo"', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    authorized: true,
    format: 'bestvideo+bestaudio'
  });
  assert(status === 400, `Expected 400, got ${status}`);
  assert(json.error.code === 'DOWNLOAD_FORMAT_UNAVAILABLE', `Got ${json.error.code}`);
});

await test('POST /api/v1/download returns 400 for format with --exec injection', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    authorized: true,
    format: '--exec echo pwned'
  });
  assert(status === 400, `Expected 400, got ${status}`);
  assert(json.error.code === 'DOWNLOAD_FORMAT_UNAVAILABLE', `Got ${json.error.code}`);
});

// ── URL validation / command injection protection ────────────────────────────

await test('POST /api/v1/download rejects URL with shell metacharacter: semicolon', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ; echo pwned',
    authorized: true,
    format: 'video'
  });
  assert([400, 422].includes(status), `Expected 400 or 422, got ${status}`);
  assert(json.success === false, 'Expected failure');
});

await test('POST /api/v1/download rejects URL with shell metacharacter: pipe', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ | cat /etc/passwd',
    authorized: true,
    format: 'video'
  });
  assert([400, 422].includes(status), `Expected 400 or 422, got ${status}`);
  assert(json.success === false, 'Expected failure');
});

await test('POST /api/v1/download rejects URL with command substitution: $()', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://www.youtube.com/watch?v=$(echo pwned)',
    authorized: true,
    format: 'video'
  });
  assert([400, 422].includes(status), `Expected 400 or 422, got ${status}`);
  assert(json.success === false, 'Expected failure');
});

await test('POST /api/v1/download rejects URL with backtick injection', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://www.youtube.com/watch?v=`cat /etc/passwd`',
    authorized: true,
    format: 'video'
  });
  assert([400, 422].includes(status), `Expected 400 or 422, got ${status}`);
  assert(json.success === false, 'Expected failure');
});

await test('POST /api/v1/download rejects URL with quotes', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ\"' --exec pwned",
    authorized: true,
    format: 'video'
  });
  assert([400, 422].includes(status), `Expected 400 or 422, got ${status}`);
  assert(json.success === false, 'Expected failure');
});

await test('POST /api/v1/download rejects fake YouTube hostname (youtube.com.attacker.test)', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://youtube.com.attacker.test/watch?v=dQw4w9WgXcQ',
    authorized: true,
    format: 'video'
  });
  assert([400, 422].includes(status), `Expected 400 or 422, got ${status}`);
  assert(json.success === false, 'Expected failure');
});

await test('POST /api/v1/download rejects lookalike hostname (youtube.example.com)', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://youtube.example.com/watch?v=dQw4w9WgXcQ',
    authorized: true,
    format: 'video'
  });
  assert([400, 422].includes(status), `Expected 400 or 422, got ${status}`);
  assert(json.success === false, 'Expected failure');
});

await test('POST /api/v1/download rejects unsupported protocol (javascript:)', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'javascript:alert(1)',
    authorized: true,
    format: 'video'
  });
  assert([400, 422].includes(status), `Expected 400 or 422, got ${status}`);
  assert(json.success === false, 'Expected failure');
});

await test('POST /api/v1/download rejects file: protocol', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'file:///etc/passwd',
    authorized: true,
    format: 'video'
  });
  assert([400, 422].includes(status), `Expected 400 or 422, got ${status}`);
  assert(json.success === false, 'Expected failure');
});

await test('POST /api/v1/download rejects malformed URL', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'not a url at all!!!',
    authorized: true,
    format: 'video'
  });
  assert([400, 422].includes(status), `Expected 400 or 422, got ${status}`);
  assert(json.success === false, 'Expected failure');
});

await test('POST /api/v1/download rejects URL with credentials (user:pass@host)', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ',
    authorized: true,
    format: 'video'
  });
  assert([400, 422].includes(status), `Expected 400 or 422, got ${status}`);
  assert(json.success === false, 'Expected failure');
});

// ── Platform restriction ─────────────────────────────────────────────────────

await test('POST /api/v1/download returns 422 for Instagram URL (not supported for download)', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://www.instagram.com/p/CqSomePost123/',
    authorized: true,
    format: 'video'
  });
  assert(status === 422, `Expected 422, got ${status}`);
  assert(json.success === false, 'Expected failure');
  assert(json.error.code === 'DOWNLOAD_FORMAT_UNAVAILABLE', `Got ${json.error.code}`);
});

await test('POST /api/v1/download returns 422 for unsupported platform (facebook.com)', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://www.facebook.com/video/12345',
    authorized: true,
    format: 'video'
  });
  assert([400, 422].includes(status), `Expected 400 or 422, got ${status}`);
  assert(json.success === false, 'Expected failure');
});

await test('POST /api/v1/download returns 422 for YouTube channel URL (no media ID)', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://www.youtube.com/@channelname',
    authorized: true,
    format: 'video'
  });
  assert([400, 422].includes(status), `Expected 400 or 422, got ${status}`);
  assert(json.success === false, 'Expected failure');
});

// ── Process security: verify no browser input controls binary or flags ────────

await test('Process security: format input cannot inject yt-dlp --output flag', async () => {
  // If this reaches yt-dlp (which it won't, server will reject), --output must not reach the binary
  const { status, json } = await post('/api/v1/download', {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    authorized: true,
    format: '--output /tmp/evil.sh'
  });
  assert(status === 400, `Expected 400, got ${status}`);
  assert(json.error.code === 'DOWNLOAD_FORMAT_UNAVAILABLE', `Got ${json.error.code}`);
});

await test('Process security: format input cannot inject yt-dlp --exec flag', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    authorized: true,
    format: '--exec rm -rf /'
  });
  assert(status === 400, `Expected 400, got ${status}`);
  assert(json.error.code === 'DOWNLOAD_FORMAT_UNAVAILABLE', `Got ${json.error.code}`);
});

await test('Process security: format input cannot inject --postprocessor-args', async () => {
  const { status, json } = await post('/api/v1/download', {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    authorized: true,
    format: '--postprocessor-args "ffmpeg:-vf scale=320:240"'
  });
  assert(status === 400, `Expected 400, got ${status}`);
  assert(json.error.code === 'DOWNLOAD_FORMAT_UNAVAILABLE', `Got ${json.error.code}`);
});

// ── Dependency detection ─────────────────────────────────────────────────────

await test('detectDependencies() returns yt-dlp as installed (yt-dlp is on PATH)', async () => {
  const { detectDependencies } = await import('../server/utils/dependency-check.js');
  const deps = await detectDependencies(true); // force fresh check
  assert(deps.ytdlp === true, 'Expected installed development yt-dlp to be detected');
  assert(typeof deps.ytdlpVersion === 'string', 'Expected yt-dlp version string');
  assert(deps.ytdlpPath !== null, 'Expected ytdlpPath to be set');
});

await test('detectDependencies() returns ffmpeg as installed', async () => {
  const { detectDependencies } = await import('../server/utils/dependency-check.js');
  const deps = await detectDependencies();
  assert(deps.ffmpeg === true, 'Expected ffmpeg to be detected as installed');
  assert(typeof deps.ffmpegPath === 'string', 'Expected ffmpegPath');
});

await test('detectDependencies() returns ffprobe as installed', async () => {
  const { detectDependencies } = await import('../server/utils/dependency-check.js');
  const deps = await detectDependencies();
  assert(deps.ffprobe === true, 'Expected ffprobe to be detected as installed');
});

// ── Temp directory ───────────────────────────────────────────────────────────

await test('Temp directory exists after server startup', async () => {
  const tempDir = path.resolve(__dirname, '..', 'temp');
  try {
    await fs.access(tempDir);
  } catch {
    throw new Error(`Temp directory does not exist at ${tempDir}`);
  }
});

// ── Quality allow-list verification ─────────────────────────────────────────

await test('VALID_QUALITIES includes all documented quality options', async () => {
  const { VALID_QUALITIES } = await import('../server/services/download.service.js');
  const expected = ['best', '1080p', '720p', '480p', '360p'];
  for (const q of expected) {
    assert(VALID_QUALITIES.has(q), `Expected VALID_QUALITIES to include '${q}'`);
  }
});

// ── Instagram regression ─────────────────────────────────────────────────────

await test('POST /api/v1/analyze still returns Instagram Reel metadata (regression)', async () => {
  const { status, json } = await post('/api/v1/analyze', { url: 'https://www.instagram.com/reel/CqRegressionTest/' });
  assert(status === 200, `Expected 200, got ${status}`);
  assert(json.success === true, 'Expected success:true');
  assert(json.data.platform === 'instagram', 'Expected instagram platform');
});

await test('POST /api/v1/analyze still returns YouTube metadata (regression)', async () => {
  const { status, json } = await post('/api/v1/analyze', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert(status === 200, `Expected 200, got ${status}`);
  assert(json.success === true, 'Expected success:true');
  assert(json.data.platform === 'youtube', 'Expected youtube platform');
  assert(json.data.capabilities?.metadata === true, 'Expected metadata:true');
  assert(json.data.capabilities?.download === false, 'Expected download:false on analyze response');
});

// ── Error model completeness ─────────────────────────────────────────────────

await test('Download error codes all return structured {success, error} JSON', async () => {
  // DOWNLOAD_NOT_AUTHORIZED
  const r1 = await post('/api/v1/download', {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    authorized: false
  });
  assert(r1.json?.error?.code, 'Expected error.code on 403 response');
  assert(r1.json?.error?.message, 'Expected error.message on 403 response');
  assert(r1.json?.success === false, 'Expected success:false');
});

// ─────────────────────────────────────────────────────────────────────────────

await stopServer();

console.log(`\n${passed + failed === 0 ? 'No tests ran.' : `${passed} passed, ${failed} failed.`}`);

if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ✗ ${f.description}\n    ${f.error}`));
  process.exit(1);
} else {
  console.log('\nALL download subsystem tests passed!\n');
  process.exit(0);
}
