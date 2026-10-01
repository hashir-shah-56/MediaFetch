import { getYouTubeProvider } from '../providers/youtube/index.js';

/**
 * YouTube Service Layer
 * Coordinates validated YouTube URL requests with the configured YouTube provider.
 */
export const youtubeService = {
  /**
   * Analyze validated YouTube media and retrieve metadata via the configured provider.
   * @param {Object} parsedMedia - Validated media object from URL parser.
   * @returns {Promise<Object>} Normalized MediaFetch YouTube object.
   */
  async analyze(parsedMedia) {
    const provider = getYouTubeProvider();
    return await provider.getVideoInfo(parsedMedia);
  }
};
