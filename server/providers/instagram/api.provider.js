import { BaseInstagramProvider, ProviderError, isValidHttpsMediaUrl, generateSafeFileName } from './instagram.provider.js';
import { env } from '../../config/env.js';

/**
 * Standard HTTP API Provider for Instagram
 * Connects to an external authenticated Instagram metadata/media API service.
 */
export class ApiInstagramProvider extends BaseInstagramProvider {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey ?? env.INSTAGRAM_API_KEY;
    this.baseUrl = config.baseUrl ?? env.INSTAGRAM_API_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? env.INSTAGRAM_TIMEOUT_MS;
  }

  /**
   * Fetch media info from external provider API.
   * @param {Object} params
   * @param {string} params.normalizedUrl
   * @param {string} params.mediaId
   * @param {string} params.contentType
   * @returns {Promise<Object>}
   */
  async getMediaInfo({ normalizedUrl, mediaId, contentType }) {
    if (!this.apiKey || !this.apiKey.trim()) {
      throw new ProviderError(
        'INSTAGRAM_PROVIDER_NOT_CONFIGURED',
        'Instagram processing is not configured on this server.',
        503
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({
          url: normalizedUrl,
          shortcode: mediaId,
          type: contentType
        }),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new ProviderError(
          'PROVIDER_TIMEOUT',
          'Instagram took too long to respond. Please try again.',
          504
        );
      }
      throw new ProviderError(
        'PROVIDER_UNAVAILABLE',
        'The Instagram media provider is currently unreachable. Please try again later.',
        503
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle HTTP error status codes
    if (!response.ok) {
      if (response.status === 401) {
        throw new ProviderError(
          'PROVIDER_AUTH_ERROR',
          'Instagram provider authentication failed.',
          502
        );
      }
      if (response.status === 403) {
        throw new ProviderError(
          'INSTAGRAM_PRIVATE_CONTENT',
          "This Instagram content isn't publicly available or cannot be accessed.",
          403
        );
      }
      if (response.status === 404) {
        throw new ProviderError(
          'INSTAGRAM_MEDIA_NOT_FOUND',
          "We couldn't find media for this Instagram link.",
          404
        );
      }
      if (response.status === 429) {
        throw new ProviderError(
          'PROVIDER_RATE_LIMITED',
          'Instagram processing is temporarily busy. Please try again shortly.',
          429
        );
      }
      if (response.status >= 500) {
        throw new ProviderError(
          'PROVIDER_UNAVAILABLE',
          'The Instagram media provider encountered an error. Please try again later.',
          503
        );
      }
      throw new ProviderError(
        'PROVIDER_BAD_RESPONSE',
        'The Instagram provider returned an unexpected response.',
        502
      );
    }

    // Parse and normalize JSON payload
    let raw;
    try {
      raw = await response.json();
    } catch {
      throw new ProviderError(
        'PROVIDER_BAD_RESPONSE',
        'The Instagram provider returned malformed data.',
        502
      );
    }

    return this.normalizeApiResponse(raw, { normalizedUrl, mediaId, contentType });
  }

  /**
   * Normalizes external API response into MediaFetch internal schema.
   * @param {Object} raw
   * @param {Object} context
   * @returns {Object}
   */
  normalizeApiResponse(raw, { normalizedUrl, mediaId, contentType }) {
    if (!raw || typeof raw !== 'object') {
      throw new ProviderError(
        'PROVIDER_BAD_RESPONSE',
        'The Instagram provider returned an invalid payload.',
        502
      );
    }

    // Check if provider indicated not found or private content inside response
    if (raw.isPrivate || raw.private) {
      throw new ProviderError(
        'INSTAGRAM_PRIVATE_CONTENT',
        "This Instagram content isn't publicly available or cannot be accessed.",
        403
      );
    }

    // Extract metadata
    const metadata = {};
    if (raw.author && typeof raw.author === 'string') {
      metadata.author = raw.author.trim().replace(/^@?/, '@');
    } else if (raw.username && typeof raw.username === 'string') {
      metadata.author = `@${raw.username.trim()}`;
    }

    if (raw.caption && typeof raw.caption === 'string') {
      metadata.caption = raw.caption.trim();
    }

    if (raw.thumbnail && isValidHttpsMediaUrl(raw.thumbnail)) {
      metadata.thumbnail = raw.thumbnail.trim();
    }

    // Extract & validate media array
    const rawMediaList = Array.isArray(raw.media) ? raw.media
      : raw.url ? [{ type: raw.type || (contentType.includes('reel') || contentType.includes('video') ? 'video' : 'image'), url: raw.url, width: raw.width, height: raw.height }]
      : [];

    const normalizedMedia = [];
    rawMediaList.forEach((item, index) => {
      if (item && typeof item === 'object' && isValidHttpsMediaUrl(item.url)) {
        const itemType = item.type === 'video' || item.type === 'image' ? item.type
          : (contentType.includes('reel') || contentType.includes('video') ? 'video' : 'image');

        normalizedMedia.push({
          type: itemType,
          url: item.url.trim(),
          width: typeof item.width === 'number' ? item.width : null,
          height: typeof item.height === 'number' ? item.height : null,
          fileName: generateSafeFileName('instagram', contentType, mediaId, rawMediaList.length > 1 ? index : null, itemType === 'video' ? 'mp4' : 'jpg')
        });
      }
    });

    if (normalizedMedia.length === 0) {
      throw new ProviderError(
        'INSTAGRAM_MEDIA_UNAVAILABLE',
        'No accessible media files could be retrieved for this Instagram URL.',
        422
      );
    }

    return {
      platform: 'instagram',
      contentType,
      mediaId,
      normalizedUrl,
      metadata,
      media: normalizedMedia,
      capabilities: {
        metadata: true,
        download: true
      }
    };
  }
}
