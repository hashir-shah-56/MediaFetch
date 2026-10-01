import { env } from '../../config/env.js';
import { ApiYouTubeProvider } from './api.provider.js';
import { MockYouTubeProvider } from './mock.provider.js';
import { ProviderError } from './youtube.provider.js';

let customProviderInstance = null;

/**
 * Get the active YouTube provider instance.
 * @returns {import('./youtube.provider.js').BaseYouTubeProvider}
 */
export function getYouTubeProvider() {
  if (customProviderInstance) {
    return customProviderInstance;
  }

  const providerType = (env.YOUTUBE_PROVIDER || 'api').toLowerCase();

  switch (providerType) {
    case 'mock':
      return new MockYouTubeProvider();
    case 'api':
      return new ApiYouTubeProvider();
    default:
      throw new ProviderError(
        'YOUTUBE_PROVIDER_NOT_CONFIGURED',
        `Unknown YouTube provider: '${providerType}'. Supported providers: 'api', 'mock'.`,
        503
      );
  }
}

/**
 * Set a custom provider instance (used for automated test fixtures).
 * @param {import('./youtube.provider.js').BaseYouTubeProvider|null} provider
 */
export function setYouTubeProvider(provider) {
  customProviderInstance = provider;
}
