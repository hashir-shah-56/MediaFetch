import { getInstagramProvider } from '../providers/instagram/index.js';

/**
 * Instagram Service Layer
 * Coordinates validated Instagram URL requests with the configured provider.
 */
export const instagramService = {
  /**
   * Analyze validated Instagram media and retrieve metadata/media via the configured provider.
   * @param {Object} parsedMedia - Validated media object from URL parser.
   * @returns {Promise<Object>} Normalized MediaFetch media object.
   */
  async analyze(parsedMedia) {
    const provider = getInstagramProvider();
    return await provider.getMediaInfo(parsedMedia);
  }
};
