import { env } from '../../config/env.js';
import { ApiInstagramProvider } from './api.provider.js';
import { MockInstagramProvider } from './mock.provider.js';
import { ProviderError } from './instagram.provider.js';

let customProviderInstance = null;

/**
 * Get the active Instagram provider instance.
 * @returns {import('./instagram.provider.js').BaseInstagramProvider}
 */
export function getInstagramProvider() {
  if (customProviderInstance) {
    return customProviderInstance;
  }

  const providerType = (env.INSTAGRAM_PROVIDER || 'api').toLowerCase();

  switch (providerType) {
    case 'mock':
      return new MockInstagramProvider();
    case 'api':
      return new ApiInstagramProvider();
    default:
      throw new ProviderError(
        'INSTAGRAM_PROVIDER_NOT_CONFIGURED',
        `Unknown Instagram provider: '${providerType}'. Supported providers: 'api', 'mock'.`,
        503
      );
  }
}

/**
 * Set a custom provider instance (used primarily for automated test fixtures).
 * @param {import('./instagram.provider.js').BaseInstagramProvider|null} provider
 */
export function setInstagramProvider(provider) {
  customProviderInstance = provider;
}
