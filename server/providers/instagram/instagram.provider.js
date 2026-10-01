/**
 * Base Instagram Provider Interface and Utilities
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
 * Validates that an external media URL is a secure, well-formed HTTPS URL.
 * @param {string} url - Candidate media URL.
 * @returns {boolean} True if safe HTTPS URL.
 */
export function isValidHttpsMediaUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Generates a clean, sanitized filename for media download/saving.
 * @param {string} platform - Platform identifier.
 * @param {string} contentType - Content type (e.g. instagram_reel).
 * @param {string} mediaId - Sanitized media ID.
 * @param {number} [index] - Optional item index for carousels.
 * @param {string} [extension='mp4'] - File extension.
 * @returns {string} Safe filename without path traversal or dangerous characters.
 */
export function generateSafeFileName(platform, contentType, mediaId, index = null, extension = 'mp4') {
  const cleanId = String(mediaId).replace(/[^A-Za-z0-9_-]/g, '');
  const cleanExt = String(extension).replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  const typePart = contentType.replace(/_/g, '-');
  const indexPart = index !== null && index !== undefined ? `-${index + 1}` : '';
  return `${typePart}-${cleanId}${indexPart}.${cleanExt}`;
}

/**
 * Abstract Base Provider Class
 */
export class BaseInstagramProvider {
  /**
   * Fetch and normalize media information from the provider.
   * @param {Object} params
   * @param {string} params.normalizedUrl
   * @param {string} params.mediaId
   * @param {string} params.contentType
   * @returns {Promise<Object>}
   */
  async getMediaInfo({ normalizedUrl, mediaId, contentType }) { // eslint-disable-line no-unused-vars
    throw new Error('getMediaInfo must be implemented by the provider subclass.');
  }
}
