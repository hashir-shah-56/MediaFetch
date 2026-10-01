import assert from 'node:assert/strict';
import { analyzeUrl } from '../js/url-parser.js';
export const cases = [];
const good = (input, platform, contentType, mediaId) => cases.push({ input, platform, contentType, mediaId, valid: true });
const bad = (input, code) => cases.push({ input, valid: false, code });
const video = 'dQw4w9WgXcQ';
for (const host of ['youtube.com', 'www.youtube.com', 'm.youtube.com']) {
  for (const suffix of ['', '&t=30s', '&list=PL123&index=2', '&utm_source=test#t=30s']) good(`https://${host}/watch?v=${video}${suffix}`, 'youtube', 'youtube_video', video);
  good(`https://${host}/shorts/${video}/?si=test`, 'youtube', 'youtube_short', video);
}
for (const host of ['youtu.be', 'www.youtu.be']) {
  for (const suffix of ['', '/', '?t=30&list=PL123', '#t=30s']) good(`https://${host}/${video}${suffix}`, 'youtube', 'youtube_video', video);
}
for (const host of ['instagram.com', 'www.instagram.com']) {
  for (const [path, type] of [['p', 'instagram_post'], ['reel', 'instagram_reel'], ['reels', 'instagram_reel'], ['tv', 'instagram_video']]) {
    for (const suffix of ['', '/', '/?igsh=abc&utm_source=test#fragment']) good(`https://${host}/${path}/ABC123${suffix}`, 'instagram', type, 'ABC123');
  }
}
for (const input of [`youtube.com/watch?v=${video}`, `HTTP://WWW.YOUTUBE.COM:80/watch/?v=${video}`, `  https://WWW.YouTube.COM/watch?v=${video}  `]) good(input, 'youtube', 'youtube_video', video);
good('instagram.com/reel/Ab_12-/', 'instagram', 'instagram_reel', 'Ab_12-');
good(' https://INSTAGRAM.COM/p/ABC123/ ', 'instagram', 'instagram_post', 'ABC123');
good(`https://youtube.com/watch?v=${video}&custom=keep%20me`, 'youtube', 'youtube_video', video);
for (const input of ['', '   ']) bad(input, 'EMPTY_URL');
for (const input of ['hello', 'not a url', '://youtube', 'https://', 'https:///youtube.com/watch', 'https:youtube.com/watch', '//youtube.com/watch', 'https://youtube.com:8443/watch', 'https://user:secret@youtube.com/watch', 'https://youtube.com/a b', 'https://youtube.com\\@evil.test/watch', 'https://youtube.com/../watch', 'https://youtube.com/%2e%2e/watch', 'https://%79outube.com/watch', 'https://ｙoutube.com/watch', 'https://youtube.com/wa\ntch', 'x'.repeat(2049), null]) bad(input, 'INVALID_URL');
for (const input of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/a', 'ftp://youtube.com/a', 'mailto:test@example.com']) bad(input, 'UNSUPPORTED_PROTOCOL');
for (const host of ['youtube.com.fake-site.com', 'instagram.com.evil.test', 'facebook.com', 'tiktok.com', 'example.com', 'youtube.co', 'www.youtube.com.evil.test', 'youtube.com.', 'm.instagram.com', 'youtube-nocookie.com', 'xn--yutube-wqf.com', '127.0.0.1']) bad(`https://${host}/watch?v=${video}`, 'UNSUPPORTED_PLATFORM');
for (const path of ['', 'username/', 'stories/username/123/', 'accounts/login/', 'explore/', 'p/ABC123/extra', 'reel/ABC123//', 'P/ABC123', 'constructor/ABC123']) bad(`https://instagram.com/${path}`, 'UNSUPPORTED_INSTAGRAM_TYPE');
for (const path of ['', 'channel/abc', 'user/abc', '@someone', 'c/someone', 'playlist?list=PL123', 'results?search_query=test', 'shorts/abc/extra', 'watch/extra?v=abc', 'embed/dQw4w9WgXcQ']) bad(`https://youtube.com/${path}`, 'UNSUPPORTED_YOUTUBE_TYPE');
for (const input of ['https://instagram.com/p/', 'https://instagram.com/reel', 'https://youtube.com/watch', 'https://youtube.com/watch?v=', 'https://youtube.com/shorts/', 'https://youtu.be/']) bad(input, 'MISSING_MEDIA_ID');
for (const input of ['https://instagram.com/p/abc%2Fdef/', 'https://instagram.com/p/abc.def/', `https://instagram.com/p/${'a'.repeat(65)}/`, 'https://youtube.com/watch?v=abc', 'https://youtu.be/abcdefghijkl', 'https://youtube.com/shorts/abc', `https://youtube.com/watch?v=${video}&v=${video}`, `https://youtu.be/${video}?v=abcdefghijk`, 'https://youtube.com/watch?v=%3Cscript%3E']) bad(input, 'INVALID_MEDIA_ID');

export function runMatrix(analyze = analyzeUrl) {
  for (const test of cases) {
    const result = analyze(test.input);
    assert.equal(result.valid, test.valid, JSON.stringify(test));
    if (test.valid) {
      for (const key of ['platform', 'contentType', 'mediaId']) assert.equal(result[key], test[key], JSON.stringify(test));
      assert.equal(result.originalUrl, test.input);
      assert.equal(new URL(result.normalizedUrl).protocol, 'https:');
      assert.equal(new URL(result.normalizedUrl).hostname, result.hostname);
      assert.equal(analyze(result.normalizedUrl).normalizedUrl, result.normalizedUrl, 'Normalization must be idempotent');
      assert.deepEqual(Object.keys(result).sort(), ['valid', 'platform', 'contentType', 'originalUrl', 'normalizedUrl', 'mediaId', 'hostname'].sort());
    } else {
      assert.equal(result.error.code, test.code, JSON.stringify(test));
      assert.ok(result.error.message);
      assert.equal('normalizedUrl' in result, false);
    }
  }
  const youtube = analyze(`http://M.YOUTUBE.COM/watch/?v=${video}&t=30s&list=PL123&custom=keep&utm_source=test&si=abc#t=10s`);
  assert.equal(youtube.normalizedUrl, `https://m.youtube.com/watch?v=${video}&t=30s&list=PL123&custom=keep#t=10s`);
  assert.equal(analyze('instagram.com/reels/ABC123?igsh=abc&img_index=2#fragment').normalizedUrl, 'https://instagram.com/reel/ABC123/?img_index=2');
  console.log(`PASS ${cases.length} parser matrix cases plus normalization, idempotence and result-shape assertions`);
}
runMatrix();
