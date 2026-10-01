import { analyzeUrl, PLATFORMS } from '../utils/url-parser.js';
import { instagramService } from '../services/instagram.service.js';
import { youtubeService } from '../services/youtube.service.js';

const statusCodeMap = Object.freeze({
  EMPTY_URL: 400,
  MISSING_URL: 400,
  INVALID_URL_TYPE: 400,
  URL_TOO_LONG: 400,
  INVALID_REQUEST: 400,
  INVALID_URL: 400,
  UNSUPPORTED_PROTOCOL: 422,
  UNSUPPORTED_PLATFORM: 422,
  UNSUPPORTED_INSTAGRAM_TYPE: 422,
  UNSUPPORTED_YOUTUBE_TYPE: 422,
  MISSING_MEDIA_ID: 422,
  INVALID_MEDIA_ID: 422,

  // Instagram Provider error status mappings
  INSTAGRAM_PROVIDER_NOT_CONFIGURED: 503,
  INSTAGRAM_MEDIA_NOT_FOUND: 404,
  INSTAGRAM_MEDIA_UNAVAILABLE: 422,
  INSTAGRAM_PRIVATE_CONTENT: 403,
  INSTAGRAM_UNSUPPORTED_MEDIA: 422,
  PROVIDER_TIMEOUT: 504,
  PROVIDER_RATE_LIMITED: 429,
  PROVIDER_AUTH_ERROR: 502,
  PROVIDER_BAD_RESPONSE: 502,
  PROVIDER_UNAVAILABLE: 503,

  // YouTube Provider error status mappings
  YOUTUBE_PROVIDER_NOT_CONFIGURED: 503,
  YOUTUBE_VIDEO_NOT_FOUND: 404,
  YOUTUBE_METADATA_UNAVAILABLE: 422,
  YOUTUBE_API_QUOTA_EXCEEDED: 429,
  YOUTUBE_API_AUTH_ERROR: 502,
  YOUTUBE_API_BAD_RESPONSE: 502,
  YOUTUBE_API_UNAVAILABLE: 503,
  YOUTUBE_API_TIMEOUT: 504
});

export const mediaController = {
  /**
   * Handle POST /api/v1/analyze
   */
  async analyzeMedia(req, res, next) {
    try {
      const body = req.body;

      // 1. Request body structure validation
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Request body must be a valid JSON object.'
          }
        });
      }

      // 2. 'url' presence and type validation
      if (!('url' in body)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_URL',
            message: "A 'url' field is required in the request body."
          }
        });
      }

      if (typeof body.url !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_URL_TYPE',
            message: "The 'url' field must be a string."
          }
        });
      }

      const trimmedUrl = body.url.trim();

      if (!trimmedUrl) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'EMPTY_URL',
            message: 'Paste an Instagram or YouTube link to continue.'
          }
        });
      }

      if (trimmedUrl.length > 2048) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'URL_TOO_LONG',
            message: 'Use a URL with 2,048 characters or fewer.'
          }
        });
      }

      // 3. Authoritative server-side URL analysis
      const analysis = analyzeUrl(body.url);

      if (!analysis.valid) {
        const code = analysis.error.code;
        const status = statusCodeMap[code] || 400;
        return res.status(status).json({
          success: false,
          error: {
            code: analysis.error.code,
            message: analysis.error.message
          }
        });
      }

      // 4. Platform routing and provider execution
      let data;
      if (analysis.platform === PLATFORMS.INSTAGRAM) {
        data = await instagramService.analyze(analysis);
      } else if (analysis.platform === PLATFORMS.YOUTUBE) {
        data = await youtubeService.analyze(analysis);
      } else {
        return res.status(422).json({
          success: false,
          error: {
            code: 'UNSUPPORTED_PLATFORM',
            message: 'MediaFetch currently supports Instagram and YouTube links.'
          }
        });
      }

      // 5. Success response
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      if (err.name === 'ProviderError' || err.code in statusCodeMap) {
        const status = err.statusCode || statusCodeMap[err.code] || 500;
        return res.status(status).json({
          success: false,
          error: {
            code: err.code || 'INTERNAL_SERVER_ERROR',
            message: err.message || 'An error occurred while communicating with the media provider.'
          }
        });
      }
      return next(err);
    }
  }
};
