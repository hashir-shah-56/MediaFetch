import { BaseYouTubeProvider, ProviderError } from './youtube.provider.js';

/**
 * Mock YouTube Provider for automated testing and offline development.
 * Simulates real YouTube Data API v3 responses and edge cases deterministically.
 */
export class MockYouTubeProvider extends BaseYouTubeProvider {
  /**
   * Fetch simulated video metadata.
   * @param {Object} params
   * @param {string} params.mediaId
   * @param {string} params.normalizedUrl
   * @param {string} params.contentType
   * @returns {Promise<Object>}
   */
  async getVideoInfo({ mediaId, normalizedUrl, contentType }) {
    // Edge cases based on mediaId prefix
    if (mediaId.startsWith('notfound') || mediaId.startsWith('missing')) {
      throw new ProviderError(
        'YOUTUBE_VIDEO_NOT_FOUND',
        "We couldn't find an available YouTube video for this link.",
        404
      );
    }

    if (mediaId.startsWith('quota')) {
      throw new ProviderError(
        'YOUTUBE_API_QUOTA_EXCEEDED',
        'YouTube information is temporarily unavailable due to API quota limits. Please try again later.',
        429
      );
    }

    if (mediaId.startsWith('auth')) {
      throw new ProviderError(
        'YOUTUBE_API_AUTH_ERROR',
        'YouTube API authentication failed. Check API key configuration.',
        502
      );
    }

    if (mediaId.startsWith('timeout')) {
      throw new ProviderError(
        'YOUTUBE_API_TIMEOUT',
        'YouTube took too long to respond. Please try again.',
        504
      );
    }

    if (mediaId.startsWith('unavailable') || mediaId.startsWith('error')) {
      throw new ProviderError(
        'YOUTUBE_API_UNAVAILABLE',
        'The YouTube API service is currently unavailable. Please try again later.',
        503
      );
    }

    // Shorts simulation
    if (contentType === 'youtube_short' || mediaId.startsWith('shorts')) {
      return {
        platform: 'youtube',
        contentType: 'youtube_short',
        mediaId,
        normalizedUrl,
        metadata: {
          title: 'Incredible Golden Sunset Over the Mountains #Shorts',
          channelTitle: 'Earth Explorer',
          channelId: 'UCearth1234567890',
          description: 'A breathtaking 45-second sunset view captured in 4K. #nature #shorts',
          publishedAt: '2024-03-15T18:30:00Z',
          thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop',
          duration: '0:45'
        },
        capabilities: {
          metadata: true,
          download: false
        }
      };
    }

    // Standard YouTube Video simulation
    return {
      platform: 'youtube',
      contentType: 'youtube_video',
      mediaId,
      normalizedUrl,
      metadata: {
        title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
        channelTitle: 'Rick Astley',
        channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
        description: 'The official video for "Never Gonna Give You Up" by Rick Astley.\nTaken from the album "Whenever You Need Somebody".',
        publishedAt: '2009-10-25T06:57:33Z',
        thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop',
        duration: '3:33'
      },
      capabilities: {
        metadata: true,
        download: false
      }
    };
  }
}
