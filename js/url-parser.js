/** Pure local URL analysis: no existence/access checks or I/O. */
export const PLATFORMS = Object.freeze({ INSTAGRAM: 'instagram', YOUTUBE: 'youtube' });
export const CONTENT_TYPES = Object.freeze({ INSTAGRAM_POST: 'instagram_post', INSTAGRAM_REEL: 'instagram_reel', INSTAGRAM_VIDEO: 'instagram_video', YOUTUBE_VIDEO: 'youtube_video', YOUTUBE_SHORT: 'youtube_short' });
export const PLATFORM_HOSTS = Object.freeze({ instagram: Object.freeze(['instagram.com', 'www.instagram.com']), youtube: Object.freeze(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be']) });
export const ERROR_MESSAGES = Object.freeze({
  EMPTY_URL: 'Paste an Instagram or YouTube link to continue.',
  INVALID_URL: "That doesn't appear to be a valid URL. Use a web address without credentials, spaces, or a custom port.",
  UNSUPPORTED_PROTOCOL: 'Only http:// and https:// links are supported.',
  UNSUPPORTED_PLATFORM: 'MediaFetch currently supports Instagram and YouTube links.',
  UNSUPPORTED_INSTAGRAM_TYPE: 'This Instagram URL is valid, but this page type is not supported. Use a post, reel, or video link.',
  UNSUPPORTED_YOUTUBE_TYPE: 'This YouTube URL is valid, but this page type is not supported. Use a video or Short link.',
  MISSING_MEDIA_ID: 'This link is missing its media identifier. Copy the complete media URL.',
  INVALID_MEDIA_ID: 'This link contains an invalid or ambiguous media identifier. Check the complete URL.',
});
const failure = (code, message = ERROR_MESSAGES[code]) => ({ valid: false, error: { code, message } });
const instagramPaths = Object.freeze({ p: CONTENT_TYPES.INSTAGRAM_POST, reel: CONTENT_TYPES.INSTAGRAM_REEL, reels: CONTENT_TYPES.INSTAGRAM_REEL, tv: CONTENT_TYPES.INSTAGRAM_VIDEO });
const tracking = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'fbclid', 'gclid', 'igsh', 'igshid', 'si']);
export function detectPlatform(hostname) {
  return Object.keys(PLATFORM_HOSTS).find(platform => PLATFORM_HOSTS[platform].includes(hostname.toLowerCase())) ?? null;
}
/** URL API performs parsing; small patterns reject ambiguous raw input. */
export function normalizeUrl(input) {
  if (typeof input !== 'string') return failure('INVALID_URL');
  const trimmed = input.trim();
  if (!trimmed) return failure('EMPTY_URL');
  if (trimmed.length > 2048) return failure('INVALID_URL', 'Use a URL with 2,048 characters or fewer.');
  if (/[\s\u0000-\u001f\u007f\\]/u.test(trimmed)) return failure('INVALID_URL');
  let candidate = trimmed;
  if (detectPlatform(trimmed.split(/[/?#]/, 1)[0])) candidate = `https://${trimmed}`;
  let url;
  try { url = new URL(candidate); } catch { return failure('INVALID_URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) return failure('UNSUPPORTED_PROTOCOL');
  if (!candidate.toLowerCase().startsWith(`${url.protocol}//`)) return failure('INVALID_URL');
  const authority = candidate.slice(candidate.indexOf('//') + 2).split(/[/?#]/, 1)[0];
  if (!authority || /[^\x21-\x7e]|%|@/.test(authority) || url.username || url.password || url.port) return failure('INVALID_URL');
  const rawPath = candidate.slice(candidate.indexOf('//') + 2 + authority.length).split(/[?#]/, 1)[0];
  if (rawPath.split('/').some(segment => ['.', '..'].includes(segment.replace(/%2e/ig, '.')))) return failure('INVALID_URL');
  return { valid: true, url, originalUrl: input };
}
function parseContent(url, platform) {
  const path = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
  const segments = path.split('/').slice(1);
  const [kind, id] = segments;
  if (platform === PLATFORMS.INSTAGRAM) {
    const contentType = Object.hasOwn(instagramPaths, kind) ? instagramPaths[kind] : null;
    if (!contentType) {
      const message = kind === 'stories' ? "Instagram stories aren't supported yet. Use a post, reel, or video link."
        : kind && segments.length === 1 && !['accounts', 'explore', 'direct'].includes(kind) ? "This Instagram URL is valid, but profile URLs aren't supported yet." : undefined;
      return failure('UNSUPPORTED_INSTAGRAM_TYPE', message);
    }
    if (!id && segments.length <= 2) return failure('MISSING_MEDIA_ID');
    if (segments.length !== 2) return failure('UNSUPPORTED_INSTAGRAM_TYPE');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return failure('INVALID_MEDIA_ID');
    return { valid: true, contentType, mediaId: id, pathname: `/${kind === 'reels' ? 'reel' : kind}/${id}/` };
  }
  const shortHost = ['youtu.be', 'www.youtu.be'].includes(url.hostname);
  let mediaId, contentType = CONTENT_TYPES.YOUTUBE_VIDEO;
  if (shortHost) {
    if (!kind) return failure('MISSING_MEDIA_ID');
    if (segments.length !== 1) return failure('UNSUPPORTED_YOUTUBE_TYPE');
    mediaId = kind;
  } else if (kind === 'watch' && segments.length === 1) {
    const ids = url.searchParams.getAll('v');
    if (ids.length > 1) return failure('INVALID_MEDIA_ID');
    mediaId = ids[0];
  } else if (kind === 'shorts' && segments.length <= 2) {
    contentType = CONTENT_TYPES.YOUTUBE_SHORT;
    mediaId = id;
  } else {
    const message = ['channel', 'user', 'c'].includes(kind) || kind?.startsWith('@') ? "This YouTube URL is valid, but channel URLs aren't supported." : undefined;
    return failure('UNSUPPORTED_YOUTUBE_TYPE', message);
  }
  if (!mediaId) return failure('MISSING_MEDIA_ID');
  if (!/^[A-Za-z0-9_-]{11}$/.test(mediaId)) return failure('INVALID_MEDIA_ID');
  if (kind !== 'watch' && url.searchParams.has('v') && (url.searchParams.getAll('v').length !== 1 || url.searchParams.get('v') !== mediaId)) return failure('INVALID_MEDIA_ID');
  return { valid: true, contentType, mediaId, pathname: path };
}
export function analyzeUrl(input) {
  const normalized = normalizeUrl(input);
  if (!normalized.valid) return normalized;
  const { url, originalUrl } = normalized;
  const platform = detectPlatform(url.hostname);
  if (!platform) return failure('UNSUPPORTED_PLATFORM');
  const content = parseContent(url, platform);
  if (!content.valid) return content;
  url.protocol = 'https:';
  url.pathname = content.pathname;
  for (const key of [...url.searchParams.keys()]) if (tracking.has(key.toLowerCase())) url.searchParams.delete(key);
  // YouTube fragments may carry timing; keep them conservatively.
  if (platform === PLATFORMS.INSTAGRAM) url.hash = '';
  return { valid: true, platform, contentType: content.contentType, originalUrl, normalizedUrl: url.href, mediaId: content.mediaId, hostname: url.hostname };
}
