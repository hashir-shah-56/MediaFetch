import { analyzeUrl } from '../utils/url-parser.js';
import { downloadService, VALID_QUALITIES } from '../services/download.service.js';
import { sendDownloadError, downloadError } from '../utils/download-errors.js';
export function createDownloadController(service = downloadService) {
  return async (req, res) => {
    const fail = (code, message, status = 400) => res.status(status).json({ success: false, error: { code, message } });
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('INVALID_REQUEST', 'Request body must be a JSON object.');
      if (!Object.hasOwn(body, 'url')) return fail('MISSING_URL', 'A URL is required.');
      if (typeof body.url !== 'string') return fail('INVALID_URL_TYPE', 'The URL must be a string.');
      if (!body.url.trim()) return fail('EMPTY_URL', 'Paste a YouTube media URL.');
      if (body.url.trim().length > 2048) return fail('URL_TOO_LONG', 'Use a URL with 2,048 characters or fewer.');
      if (body.authorized !== true) return sendDownloadError(res, downloadError('DOWNLOAD_NOT_AUTHORIZED'));
      if (Object.keys(body).some(key => !['url', 'format', 'quality', 'authorized'].includes(key))) return fail('INVALID_REQUEST', 'Unsupported request option.');
      if (body.format !== 'video' || (body.quality !== undefined && !VALID_QUALITIES.has(body.quality))) return fail('DOWNLOAD_FORMAT_UNAVAILABLE', 'Choose video format and one of the supported quality options.', 400);
      const analysis = analyzeUrl(body.url);
      if (!analysis.valid) return fail(analysis.error.code, analysis.error.message, analysis.error.code.startsWith('UNSUPPORTED_') ? 422 : 400);
      if (analysis.platform !== 'youtube' || !['youtube_video', 'youtube_short'].includes(analysis.contentType)) return sendDownloadError(res, downloadError('DOWNLOAD_FORMAT_UNAVAILABLE'));
      await service.download(body.url, { authorized: true, quality: body.quality ?? 'best' }, req, res);
    } catch (error) { sendDownloadError(res, error); }
  };
}