/**
 * Frontend API client for MediaFetch backend service.
 */

const API_ENDPOINT      = '/api/v1/analyze';
const DOWNLOAD_ENDPOINT = '/api/v1/download';
const REQUEST_TIMEOUT_MS  = 10000;
// Download timeout longer than analysis — allow up to 10 minutes
const DOWNLOAD_TIMEOUT_MS = 600000;

/**
 * Send a URL to the backend for authoritative validation and platform analysis.
 * @param {string} url - User-provided media URL string.
 * @returns {Promise<{success: boolean, data?: Object, error?: {code: string, message: string}}>}
 */
export async function analyzeMediaUrl(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ url }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    let json;
    try {
      json = await response.json();
    } catch {
      return {
        success: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'The server returned an invalid response. Please try again later.'
        }
      };
    }

    if (response.ok && json.success) {
      return {
        success: true,
        data: json.data
      };
    }

    return {
      success: false,
      error: json.error || {
        code: 'API_ERROR',
        message: 'The analysis request could not be completed.'
      }
    };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      return {
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'Analysis request timed out. Please check your connection and try again.'
        }
      };
    }

    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: "MediaFetch couldn't reach the analysis service. Please try again."
      }
    };
  }
}

/** Authorized download is separate from the metadata API. Timeout covers the body too. */
export async function downloadVideo(url, quality = 'best', authorized = false, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(DOWNLOAD_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'video/mp4, application/json' },
      body: JSON.stringify({ url, format: 'video', quality, authorized }), signal: controller.signal
    });
    if (!response.ok) {
      let payload;
      try { payload = await response.json(); } catch {}
      return { success: false, error: payload?.error || { code: 'DOWNLOAD_FAILED', message: 'The download could not be completed.' } };
    }
    if (!response.headers.get('content-type')?.startsWith('video/mp4')) throw Error('Unexpected content type');
    const blob = await response.blob();
    if (!blob.size) throw Error('Empty response');
    const match = response.headers.get('content-disposition')?.match(/filename="(youtube-[A-Za-z0-9_-]{11}\.mp4)"/);
    return { success: true, blobUrl: URL.createObjectURL(blob), filename: match?.[1] || 'mediafetch-video.mp4' };
  } catch (error) {
    return { success: false, error: { code: error.name === 'AbortError' ? 'DOWNLOAD_TIMEOUT' : 'DOWNLOAD_FAILED',
      message: signal?.aborted ? 'Download cancelled.' : error.name === 'AbortError' ? 'The download timed out.' : 'The download could not be completed. Please try again.' } };
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
