import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../server/app.js';
import { setInstagramProvider } from '../server/providers/instagram/index.js';
import { MockInstagramProvider } from '../server/providers/instagram/mock.provider.js';
import { ApiInstagramProvider } from '../server/providers/instagram/api.provider.js';
import { setYouTubeProvider } from '../server/providers/youtube/index.js';
import { MockYouTubeProvider } from '../server/providers/youtube/mock.provider.js';
import { ApiYouTubeProvider } from '../server/providers/youtube/api.provider.js';
import { formatIsoDuration, selectBestThumbnail } from '../server/providers/youtube/youtube.provider.js';

const video = 'dQw4w9WgXcQ';

// Set Mock providers by default for deterministic test execution
setInstagramProvider(new MockInstagramProvider());
setYouTubeProvider(new MockYouTubeProvider());

// Start server on an ephemeral port for testing
const server = http.createServer(app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, options);
  let json = null;
  const text = await response.text();
  try {
    json = JSON.parse(text);
  } catch {
    // text response
  }
  return {
    status: response.status,
    headers: response.headers,
    json,
    text
  };
}

let testCount = 0;
function pass(name) {
  testCount++;
  console.log(`  ✓ ${name}`);
}

console.log('Running MediaFetch Phase 5 API, YouTube Metadata & Instagram Test Suite:');

try {
  // 1. Health Endpoint Tests
  {
    const res = await request('/api/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.status, 'ok');
    assert.equal(res.json.service, 'MediaFetch API');
    pass('GET /api/v1/health returns 200 with service status');
  }


  // 2. YouTube Metadata Integration (Phase 5)
  // 2a. Standard Watch URL
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${video}` })
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.data.platform, 'youtube');
    assert.equal(res.json.data.contentType, 'youtube_video');
    assert.equal(res.json.data.mediaId, video);
    assert.equal(res.json.data.normalizedUrl, `https://www.youtube.com/watch?v=${video}`);
    assert.ok(res.json.data.metadata.title.includes('Never Gonna Give You Up'));
    assert.equal(res.json.data.metadata.channelTitle, 'Rick Astley');
    assert.ok(res.json.data.metadata.thumbnail);
    assert.equal(res.json.data.metadata.duration, '3:33');
    assert.deepEqual(res.json.data.capabilities, { metadata: true, download: false });
    assert.equal('media' in res.json.data, false);
    pass('POST /api/v1/analyze retrieves YouTube standard video metadata');
  }

  // 2b. YouTube Short URL (youtu.be)
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://youtu.be/${video}` })
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.data.platform, 'youtube');
    assert.equal(res.json.data.mediaId, video);
    assert.deepEqual(res.json.data.capabilities, { metadata: true, download: false });
    pass('POST /api/v1/analyze retrieves YouTube short URL metadata');
  }

  // 2c. YouTube Shorts URL
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://www.youtube.com/shorts/${video}` })
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.data.platform, 'youtube');
    assert.equal(res.json.data.contentType, 'youtube_short');
    assert.deepEqual(res.json.data.capabilities, { metadata: true, download: false });
    pass('POST /api/v1/analyze retrieves YouTube Shorts metadata');
  }

  // 2d. YouTube Mobile URL with Timestamp & Tracking Params
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://m.youtube.com/watch?v=${video}&t=30s&utm_source=test` })
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.data.normalizedUrl, `https://m.youtube.com/watch?v=${video}&t=30s`);
    assert.deepEqual(res.json.data.capabilities, { metadata: true, download: false });
    pass('POST /api/v1/analyze retrieves YouTube mobile URL with timestamps');
  }

  // 2e. Schemeless YouTube URL
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `youtube.com/watch?v=${video}` })
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.data.normalizedUrl, `https://youtube.com/watch?v=${video}`);
    pass('POST /api/v1/analyze retrieves schemeless YouTube URL');
  }

  // 2f. YouTube Video Not Found (404)
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=notfound_12' })
    });
    assert.equal(res.status, 404);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'YOUTUBE_VIDEO_NOT_FOUND');
    assert.match(res.json.error.message, /find an available YouTube video/);
    pass('POST /api/v1/analyze returns 404 for non-existent YouTube video');
  }

  // 2g. YouTube API Quota Exceeded (429)
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=quota_12345' })
    });
    assert.equal(res.status, 429);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'YOUTUBE_API_QUOTA_EXCEEDED');
    assert.match(res.json.error.message, /quota/);
    pass('POST /api/v1/analyze returns 429 for YouTube API quota limits');
  }

  // 2h. YouTube API Authentication Error (502)
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=auth_error1' })
    });
    assert.equal(res.status, 502);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'YOUTUBE_API_AUTH_ERROR');
    pass('POST /api/v1/analyze returns 502 for YouTube API auth errors');
  }

  // 2i. YouTube API Timeout (504)
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=timeout_123' })
    });
    assert.equal(res.status, 504);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'YOUTUBE_API_TIMEOUT');
    assert.match(res.json.error.message, /took too long/);
    pass('POST /api/v1/analyze returns 504 for YouTube API timeouts');
  }

  // 2j. YouTube API Unavailable (503)
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=unavailable' })
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'YOUTUBE_API_UNAVAILABLE');
    pass('POST /api/v1/analyze returns 503 for YouTube API service failure');
  }

  // 2k. YouTube Provider Not Configured Test (503)
  {
    setYouTubeProvider(new ApiYouTubeProvider({ apiKey: '' }));
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${video}` })
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'YOUTUBE_PROVIDER_NOT_CONFIGURED');
    assert.match(res.json.error.message, /not configured/);
    pass('POST /api/v1/analyze returns 503 YOUTUBE_PROVIDER_NOT_CONFIGURED when API key is missing');
    // Restore mock provider
    setYouTubeProvider(new MockYouTubeProvider());
  }

  // 2l. Duration Parsing Unit Tests
  {
    assert.equal(formatIsoDuration('PT4M13S'), '4:13');
    assert.equal(formatIsoDuration('PT1H2M8S'), '1:02:08');
    assert.equal(formatIsoDuration('PT30S'), '0:30');
    assert.equal(formatIsoDuration('PT1H'), '1:00:00');
    assert.equal(formatIsoDuration('PT1H30S'), '1:00:30');
    assert.equal(formatIsoDuration('PT0S'), '0:00');
    assert.equal(formatIsoDuration('P1DT2H3M4S'), '26:03:04');
    assert.equal(formatIsoDuration('invalid'), null);
    assert.equal(formatIsoDuration(null), null);
    pass('formatIsoDuration parses ISO 8601 duration correctly across all formats');
  }

  // 2m. Thumbnail Selection Unit Tests
  {
    const thumbs = {
      default: { url: 'https://img.youtube.com/vi/123/default.jpg' },
      high: { url: 'https://img.youtube.com/vi/123/hqdefault.jpg' },
      maxres: { url: 'https://img.youtube.com/vi/123/maxresdefault.jpg' }
    };
    assert.equal(selectBestThumbnail(thumbs), 'https://img.youtube.com/vi/123/maxresdefault.jpg');
    assert.equal(selectBestThumbnail({ high: { url: 'https://img.youtube.com/vi/123/hq.jpg' } }), 'https://img.youtube.com/vi/123/hq.jpg');
    assert.equal(selectBestThumbnail({ default: { url: 'http://insecure.com/thumb.jpg' } }), null);
    assert.equal(selectBestThumbnail(null), null);
    pass('selectBestThumbnail selects highest available HTTPS thumbnail with secure scheme checks');
  }

  // 3. Instagram Integration via Provider (Phase 4 Preserved)
  // 3a. Public Reel
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.instagram.com/reel/ABC123/' })
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.data.platform, 'instagram');
    assert.equal(res.json.data.contentType, 'instagram_reel');
    assert.equal(res.json.data.mediaId, 'ABC123');
    assert.ok(res.json.data.metadata.author);
    assert.ok(res.json.data.metadata.caption);
    assert.ok(res.json.data.metadata.thumbnail);
    assert.equal(res.json.data.media.length, 1);
    assert.equal(res.json.data.media[0].type, 'video');
    assert.ok(res.json.data.media[0].url.startsWith('https://'));
    assert.equal(res.json.data.media[0].fileName, 'instagram-reel-ABC123.mp4');
    assert.deepEqual(res.json.data.capabilities, { metadata: true, download: true });
    pass('POST /api/v1/analyze retrieves Instagram Reel media & metadata');
  }

  // 3b. Public Post (Single Image)
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://instagram.com/p/ABC123/' })
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.data.platform, 'instagram');
    assert.equal(res.json.data.contentType, 'instagram_post');
    assert.equal(res.json.data.media[0].type, 'image');
    assert.equal(res.json.data.media[0].fileName, 'instagram-post-ABC123.jpg');
    pass('POST /api/v1/analyze retrieves Instagram single image post');
  }

  // 3c. Carousel Post (Multiple Media Items)
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.instagram.com/p/carousel_123/' })
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.data.media.length, 3);
    assert.equal(res.json.data.media[0].type, 'image');
    assert.equal(res.json.data.media[0].fileName, 'instagram-post-carousel_123-1.jpg');
    assert.equal(res.json.data.media[1].type, 'image');
    assert.equal(res.json.data.media[2].type, 'video');
    assert.equal(res.json.data.media[2].fileName, 'instagram-post-carousel_123-3.mp4');
    pass('POST /api/v1/analyze retrieves Instagram carousel with multiple media items');
  }

  // 3d. Private Instagram Content (403)
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.instagram.com/reel/private_reel/' })
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'INSTAGRAM_PRIVATE_CONTENT');
    assert.match(res.json.error.message, /publicly available/);
    pass('POST /api/v1/analyze returns 403 for private Instagram content');
  }

  // 3e. Deleted / Not Found Content (404)
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.instagram.com/p/notfound_123/' })
    });
    assert.equal(res.status, 404);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'INSTAGRAM_MEDIA_NOT_FOUND');
    assert.match(res.json.error.message, /find media/);
    pass('POST /api/v1/analyze returns 404 for non-existent Instagram content');
  }

  // 3f. Provider Timeout (504)
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.instagram.com/reel/timeout_123/' })
    });
    assert.equal(res.status, 504);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'PROVIDER_TIMEOUT');
    assert.match(res.json.error.message, /took too long/);
    pass('POST /api/v1/analyze returns 504 for provider timeout');
  }

  // 3g. Provider Rate Limited (429)
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.instagram.com/reel/ratelimit_123/' })
    });
    assert.equal(res.status, 429);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'PROVIDER_RATE_LIMITED');
    assert.match(res.json.error.message, /temporarily busy/);
    pass('POST /api/v1/analyze returns 429 for provider rate limiting');
  }

  // 3h. Provider Unavailable (503)
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.instagram.com/reel/error_123/' })
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'PROVIDER_UNAVAILABLE');
    pass('POST /api/v1/analyze returns 503 for provider failure');
  }

  // 3i. Instagram Provider Not Configured Test (503)
  {
    setInstagramProvider(new ApiInstagramProvider({ apiKey: '' }));
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.instagram.com/reel/ABC123/' })
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'INSTAGRAM_PROVIDER_NOT_CONFIGURED');
    assert.match(res.json.error.message, /not configured/);
    pass('POST /api/v1/analyze returns 503 INSTAGRAM_PROVIDER_NOT_CONFIGURED when API key is missing');
    // Restore mock provider
    setInstagramProvider(new MockInstagramProvider());
  }

  // 4. Request Validation & Bad Request (400) Tests
  const badRequestCases = [
    {
      name: 'Missing body',
      body: undefined,
      headers: { 'Content-Type': 'application/json' },
      expectedCode: 'MISSING_URL'
    },
    {
      name: 'Array instead of object body',
      body: JSON.stringify(['https://www.youtube.com/watch?v=dQw4w9WgXcQ']),
      headers: { 'Content-Type': 'application/json' },
      expectedCode: 'INVALID_REQUEST'
    },
    {
      name: 'Missing url field',
      body: JSON.stringify({ link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
      headers: { 'Content-Type': 'application/json' },
      expectedCode: 'MISSING_URL'
    },
    {
      name: 'Non-string url (number)',
      body: JSON.stringify({ url: 12345 }),
      headers: { 'Content-Type': 'application/json' },
      expectedCode: 'INVALID_URL_TYPE'
    },
    {
      name: 'Non-string url (boolean)',
      body: JSON.stringify({ url: true }),
      headers: { 'Content-Type': 'application/json' },
      expectedCode: 'INVALID_URL_TYPE'
    },
    {
      name: 'Empty url string',
      body: JSON.stringify({ url: '' }),
      headers: { 'Content-Type': 'application/json' },
      expectedCode: 'EMPTY_URL'
    },
    {
      name: 'Whitespace-only url string',
      body: JSON.stringify({ url: '   ' }),
      headers: { 'Content-Type': 'application/json' },
      expectedCode: 'EMPTY_URL'
    },
    {
      name: 'Overlong url (> 2048 chars)',
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=' + 'a'.repeat(2049) }),
      headers: { 'Content-Type': 'application/json' },
      expectedCode: 'URL_TOO_LONG'
    },
    {
      name: 'Malformed URL',
      body: JSON.stringify({ url: 'hello world not a url' }),
      headers: { 'Content-Type': 'application/json' },
      expectedCode: 'INVALID_URL'
    },
    {
      name: 'URL with credentials',
      body: JSON.stringify({ url: 'https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ' }),
      headers: { 'Content-Type': 'application/json' },
      expectedCode: 'INVALID_URL'
    }
  ];

  for (const tc of badRequestCases) {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: tc.headers,
      body: tc.body
    });

    assert.equal(res.status, 400, `Expected 400 for ${tc.name}, got ${res.status}`);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, tc.expectedCode);
    assert.ok(res.json.error.message);
    pass(`POST /api/v1/analyze returns 400 for: ${tc.name}`);
  }

  // 5. Unprocessable Entity (422) Tests
  const unprocessableCases = [
    {
      name: 'Unsupported protocol (javascript:)',
      url: 'javascript:alert(1)',
      expectedCode: 'UNSUPPORTED_PROTOCOL'
    },
    {
      name: 'Unsupported protocol (data:)',
      url: 'data:text/html,test',
      expectedCode: 'UNSUPPORTED_PROTOCOL'
    },
    {
      name: 'Unsupported protocol (file:)',
      url: 'file:///etc/passwd',
      expectedCode: 'UNSUPPORTED_PROTOCOL'
    },
    {
      name: 'Unsupported platform (facebook.com)',
      url: 'https://facebook.com/watch?v=123',
      expectedCode: 'UNSUPPORTED_PLATFORM'
    },
    {
      name: 'Unsupported platform (tiktok.com)',
      url: 'https://tiktok.com/@user/video/1234567890',
      expectedCode: 'UNSUPPORTED_PLATFORM'
    },
    {
      name: 'Lookalike fake domain (youtube.com.evil.test)',
      url: `https://youtube.com.evil.test/watch?v=${video}`,
      expectedCode: 'UNSUPPORTED_PLATFORM'
    },
    {
      name: 'Lookalike fake domain (instagram.com.attacker.test)',
      url: 'https://instagram.com.attacker.test/reel/ABC123/',
      expectedCode: 'UNSUPPORTED_PLATFORM'
    },
    {
      name: 'YouTube channel URL',
      url: 'https://www.youtube.com/channel/UC1234567890',
      expectedCode: 'UNSUPPORTED_YOUTUBE_TYPE'
    },
    {
      name: 'YouTube handle URL',
      url: 'https://www.youtube.com/@someone',
      expectedCode: 'UNSUPPORTED_YOUTUBE_TYPE'
    },
    {
      name: 'YouTube playlist-only URL',
      url: 'https://www.youtube.com/playlist?list=PL1234567890',
      expectedCode: 'UNSUPPORTED_YOUTUBE_TYPE'
    },
    {
      name: 'Instagram profile URL',
      url: 'https://www.instagram.com/username/',
      expectedCode: 'UNSUPPORTED_INSTAGRAM_TYPE'
    },
    {
      name: 'Instagram story URL',
      url: 'https://www.instagram.com/stories/username/1234567890/',
      expectedCode: 'UNSUPPORTED_INSTAGRAM_TYPE'
    },
    {
      name: 'YouTube missing video ID',
      url: 'https://www.youtube.com/watch?v=',
      expectedCode: 'MISSING_MEDIA_ID'
    },
    {
      name: 'Instagram missing shortcode',
      url: 'https://www.instagram.com/p/',
      expectedCode: 'MISSING_MEDIA_ID'
    },
    {
      name: 'YouTube invalid ID length (not 11 chars)',
      url: 'https://www.youtube.com/watch?v=short',
      expectedCode: 'INVALID_MEDIA_ID'
    },
    {
      name: 'Instagram invalid ID characters',
      url: 'https://www.instagram.com/p/abc%2Fdef/',
      expectedCode: 'INVALID_MEDIA_ID'
    }
  ];

  for (const tc of unprocessableCases) {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: tc.url })
    });

    assert.equal(res.status, 422, `Expected 422 for ${tc.name}, got ${res.status}`);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, tc.expectedCode);
    assert.ok(res.json.error.message);
    pass(`POST /api/v1/analyze returns 422 for: ${tc.name}`);
  }

  // 6. Malformed JSON Body and Payload Limit Tests
  {
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"url": "https://www.youtube.com/watch?v=123", invalid_json'
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'INVALID_REQUEST');
    pass('Malformed JSON body returns 400 with INVALID_REQUEST');
  }

  {
    const hugePayload = JSON.stringify({
      url: 'https://www.youtube.com/watch?v=' + video,
      extra: 'x'.repeat(15000)
    });
    const res = await request('/api/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: hugePayload
    });
    assert.equal(res.status, 413);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'PAYLOAD_TOO_LARGE');
    pass('Body exceeding 10kb limit returns 413 with PAYLOAD_TOO_LARGE');
  }

  // 7. 404 Route Handling Tests
  {
    const res = await request('/api/v1/nonexistent');
    assert.equal(res.status, 404);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'NOT_FOUND');
    pass('Unmatched API route /api/v1/nonexistent returns structured 404 JSON');
  }

  {
    const res = await request('/api/unknown');
    assert.equal(res.status, 404);
    assert.equal(res.json.success, false);
    assert.equal(res.json.error.code, 'NOT_FOUND');
    pass('Unmatched API route /api/unknown returns structured 404 JSON');
  }

  // 8. Static Frontend Serving Test
  {
    const res = await request('/');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('<!doctype html>'));
    assert.ok(res.text.includes('MediaFetch'));
    pass('Static frontend index.html served at root GET /');
  }

  {
    const res = await request('/css/variables.css');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes('--bg-primary'));
    pass('Static assets served correctly (e.g. /css/variables.css)');
  }

  console.log(`\nALL ${testCount} API, YouTube metadata and Instagram tests passed successfully!`);
} finally {
  server.close();
}
