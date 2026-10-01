import { BaseInstagramProvider, ProviderError, generateSafeFileName } from './instagram.provider.js';

/**
 * Mock Instagram Provider for testing and local development.
 * Simulates real provider responses and edge cases deterministically.
 */
export class MockInstagramProvider extends BaseInstagramProvider {
  /**
   * Fetch simulated media info.
   * @param {Object} params
   * @param {string} params.normalizedUrl
   * @param {string} params.mediaId
   * @param {string} params.contentType
   * @returns {Promise<Object>}
   */
  async getMediaInfo({ normalizedUrl, mediaId, contentType }) {
    // Simulated edge cases based on mediaId prefix
    if (mediaId.startsWith('private') || mediaId === 'private_reel') {
      throw new ProviderError(
        'INSTAGRAM_PRIVATE_CONTENT',
        "This Instagram content isn't publicly available or cannot be accessed.",
        403
      );
    }

    if (mediaId.startsWith('notfound') || mediaId === 'missing_id') {
      throw new ProviderError(
        'INSTAGRAM_MEDIA_NOT_FOUND',
        "We couldn't find media for this Instagram link.",
        404
      );
    }

    if (mediaId.startsWith('timeout')) {
      throw new ProviderError(
        'PROVIDER_TIMEOUT',
        'Instagram took too long to respond. Please try again.',
        504
      );
    }

    if (mediaId.startsWith('ratelimit')) {
      throw new ProviderError(
        'PROVIDER_RATE_LIMITED',
        'Instagram processing is temporarily busy. Please try again shortly.',
        429
      );
    }

    if (mediaId.startsWith('error')) {
      throw new ProviderError(
        'PROVIDER_UNAVAILABLE',
        'The Instagram media provider is currently unavailable. Please try again later.',
        503
      );
    }

    // Carousel simulation (multiple media items)
    if (mediaId.startsWith('carousel') || mediaId === 'multi_item_123') {
      return {
        platform: 'instagram',
        contentType: 'instagram_post',
        mediaId,
        normalizedUrl,
        metadata: {
          author: '@creative_studio',
          caption: 'Exploring architectural textures and motion in the city. 🏙️✨',
          thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop',
          mediaType: 'carousel'
        },
        media: [
          {
            type: 'image',
            url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop',
            width: 1080,
            height: 1350,
            fileName: generateSafeFileName('instagram', 'instagram_post', mediaId, 0, 'jpg')
          },
          {
            type: 'image',
            url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1200&auto=format&fit=crop',
            width: 1080,
            height: 1080,
            fileName: generateSafeFileName('instagram', 'instagram_post', mediaId, 1, 'jpg')
          },
          {
            type: 'video',
            url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
            width: 1080,
            height: 1920,
            fileName: generateSafeFileName('instagram', 'instagram_post', mediaId, 2, 'mp4')
          }
        ],
        capabilities: {
          metadata: true,
          download: true
        }
      };
    }

    // Video / Reel simulation
    if (contentType === 'instagram_reel' || contentType === 'instagram_video' || mediaId.startsWith('reel')) {
      return {
        platform: 'instagram',
        contentType,
        mediaId,
        normalizedUrl,
        metadata: {
          author: '@nature_daily',
          caption: 'Golden hour waves rolling in over the coastline. 🌅🌊 #ocean #sunset',
          thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop',
          mediaType: 'video'
        },
        media: [
          {
            type: 'video',
            url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
            width: 1080,
            height: 1920,
            fileName: generateSafeFileName('instagram', contentType, mediaId, null, 'mp4')
          }
        ],
        capabilities: {
          metadata: true,
          download: true
        }
      };
    }

    // Default Single Image Post simulation
    return {
      platform: 'instagram',
      contentType: 'instagram_post',
      mediaId,
      normalizedUrl,
      metadata: {
        author: '@photographer_lens',
        caption: 'Minimalist compositions in natural light. 📷🌿',
        thumbnail: 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=800&auto=format&fit=crop',
        mediaType: 'image'
      },
      media: [
        {
          type: 'image',
          url: 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=1200&auto=format&fit=crop',
          width: 1080,
          height: 1350,
          fileName: generateSafeFileName('instagram', 'instagram_post', mediaId, null, 'jpg')
        }
      ],
      capabilities: {
        metadata: true,
        download: true
      }
    };
  }
}
