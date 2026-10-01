/**
 * Base YouTube Provider Interface and Utilities
 */

export class ProviderError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Parses an ISO 8601 duration string into a human-readable format.
 * Examples:
 * - PT4M13S   -> "4:13"
 * - PT1H2M8S  -> "1:02:08"
 * - PT30S     -> "0:30"
 * - PT1H      -> "1:00:00"
 * - PT1H30S   -> "1:00:30"
 * - P1DT2H3M4S -> "26:03:04"
 * - PT0S      -> "0:00"
 *
 * @param {string} duration - ISO 8601 duration string.
 * @returns {string|null} Formatted duration string or null if invalid.
 */
export function formatIsoDuration(duration) {
  if (!duration || typeof duration !== 'string') return null;
  const match = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return null;

  const days = parseInt(match[1] || '0', 10);
  const hours = parseInt(match[2] || '0', 10) + days * 24;
  const minutes = parseInt(match[3] || '0', 10);
  const seconds = parseInt(match[4] || '0', 10);

  if (hours === 0 && minutes === 0 && seconds === 0) {
    return '0:00';
  }

  const paddedSeconds = String(seconds).padStart(2, '0');
  if (hours > 0) {
    const paddedMinutes = String(minutes).padStart(2, '0');
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

/**
 * Selects the best available HTTPS thumbnail URL from YouTube snippet thumbnails object.
 * Priority: maxres -> standard -> high -> medium -> default.
 *
 * @param {Object} thumbnails - The thumbnails object from YouTube API snippet.
 * @returns {string|null} Secure HTTPS URL or null.
 */
export function selectBestThumbnail(thumbnails) {
  if (!thumbnails || typeof thumbnails !== 'object') return null;

  const candidates = [
    thumbnails.maxres?.url,
    thumbnails.standard?.url,
    thumbnails.high?.url,
    thumbnails.medium?.url,
    thumbnails.default?.url
  ];

  for (const url of candidates) {
    if (typeof url === 'string' && url.trim().startsWith('https://')) {
      return url.trim();
    }
  }

  return null;
}

/**
 * Abstract Base YouTube Provider Class
 */
export class BaseYouTubeProvider {
  /**
   * Fetch and normalize video metadata from the provider.
   * @param {Object} params
   * @param {string} params.mediaId
   * @param {string} params.normalizedUrl
   * @param {string} params.contentType
   * @returns {Promise<Object>}
   */
  async getVideoInfo({ mediaId, normalizedUrl, contentType }) { // eslint-disable-line no-unused-vars
    throw new Error('getVideoInfo must be implemented by the provider subclass.');
  }
}
