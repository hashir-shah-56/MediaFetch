import { BaseYouTubeProvider, ProviderError, formatIsoDuration, selectBestThumbnail } from './youtube.provider.js';
import { env } from '../../config/env.js';

/**
 * Official YouTube Data API v3 Provider Adapter
 * Queries the official YouTube Data API v3 videos endpoint using validated video IDs.
 */
export class ApiYouTubeProvider extends BaseYouTubeProvider {
  constructor(config = {}) {
    super();
    this.apiKey = config.apiKey ?? env.YOUTUBE_API_KEY;
    this.baseUrl = config.baseUrl ?? env.YOUTUBE_API_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? env.YOUTUBE_TIMEOUT_MS;
  }

  /**
   * Fetch video metadata from the official YouTube Data API v3.
   * @param {Object} params
   * @param {string} params.mediaId
   * @param {string} params.normalizedUrl
   * @param {string} params.contentType
   * @returns {Promise<Object>}
   */
  async getVideoInfo({ mediaId, normalizedUrl, contentType }) {
    if (!this.apiKey || !this.apiKey.trim()) {
      throw new ProviderError(
        'YOUTUBE_PROVIDER_NOT_CONFIGURED',
        'YouTube processing is not configured on this server.',
        503
      );
    }

    const endpoint = new URL(`${this.baseUrl.replace(/\/+$/, '')}/videos`);
    endpoint.searchParams.set('id', mediaId);
    endpoint.searchParams.set('part', 'snippet,contentDetails');
    endpoint.searchParams.set('key', this.apiKey);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await fetch(endpoint.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new ProviderError(
          'YOUTUBE_API_TIMEOUT',
          'YouTube took too long to respond. Please try again.',
          504
        );
      }
      throw new ProviderError(
        'YOUTUBE_API_UNAVAILABLE',
        'The YouTube API service is currently unreachable. Please try again later.',
        503
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle HTTP error responses from Google API
    if (!response.ok) {
      let errorBody = {};
      try {
        errorBody = await response.json();
      } catch {
        // non-json response
      }

      const reason = errorBody?.error?.errors?.[0]?.reason || '';
      const message = errorBody?.error?.message || '';

      if (response.status === 403 || response.status === 429) {
        if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || reason === 'rateLimitExceeded' || message.includes('quota')) {
          throw new ProviderError(
            'YOUTUBE_API_QUOTA_EXCEEDED',
            'YouTube information is temporarily unavailable due to API quota limits. Please try again later.',
            429
          );
        }
        if (reason === 'keyInvalid' || reason === 'forbidden' || message.includes('API key')) {
          throw new ProviderError(
            'YOUTUBE_API_AUTH_ERROR',
            'YouTube API authentication failed. Check API key configuration.',
            502
          );
        }
      }

      if (response.status === 400 && (reason === 'keyInvalid' || message.includes('API key'))) {
        throw new ProviderError(
          'YOUTUBE_API_AUTH_ERROR',
          'YouTube API key is invalid.',
          502
        );
      }

      if (response.status >= 500) {
        throw new ProviderError(
          'YOUTUBE_API_UNAVAILABLE',
          'The YouTube API service is currently unavailable. Please try again later.',
          503
        );
      }

      throw new ProviderError(
        'YOUTUBE_API_BAD_RESPONSE',
        'The YouTube API returned an unexpected error response.',
        502
      );
    }

    let raw;
    try {
      raw = await response.json();
    } catch {
      throw new ProviderError(
        'YOUTUBE_API_BAD_RESPONSE',
        'The YouTube API returned malformed data.',
        502
      );
    }

    return this.normalizeApiResponse(raw, { mediaId, normalizedUrl, contentType });
  }

  /**
   * Normalizes YouTube Data API response into MediaFetch schema.
   * @param {Object} raw
   * @param {Object} context
   * @returns {Object}
   */
  normalizeApiResponse(raw, { mediaId, normalizedUrl, contentType }) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) {
      throw new ProviderError(
        'YOUTUBE_API_BAD_RESPONSE',
        'The YouTube API returned an invalid response structure.',
        502
      );
    }

    if (raw.items.length === 0) {
      throw new ProviderError(
        'YOUTUBE_VIDEO_NOT_FOUND',
        "We couldn't find an available YouTube video for this link.",
        404
      );
    }

    const item = raw.items[0];
    const snippet = item.snippet || {};
    const contentDetails = item.contentDetails || {};

    const title = typeof snippet.title === 'string' ? snippet.title.trim() : 'YouTube Video';
    const channelTitle = typeof snippet.channelTitle === 'string' ? snippet.channelTitle.trim() : null;
    const channelId = typeof snippet.channelId === 'string' ? snippet.channelId.trim() : null;
    const description = typeof snippet.description === 'string' ? snippet.description.trim() : null;
    const publishedAt = typeof snippet.publishedAt === 'string' ? snippet.publishedAt.trim() : null;
    const thumbnail = selectBestThumbnail(snippet.thumbnails);
    const duration = formatIsoDuration(contentDetails.duration);

    return {
      platform: 'youtube',
      contentType,
      mediaId,
      normalizedUrl,
      metadata: {
        title,
        channelTitle,
        channelId,
        description,
        publishedAt,
        thumbnail,
        duration
      },
      capabilities: {
        metadata: true,
        download: false
      }
    };
  }
}
