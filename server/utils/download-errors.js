export const downloadErrors = Object.freeze({
  DOWNLOAD_NOT_AUTHORIZED: [403, 'Confirm that you own this content or have permission to download it.'],
  DOWNLOAD_DEPENDENCY_MISSING: [503, 'The download tools are unavailable. The server operator should verify yt-dlp, FFmpeg and ffprobe setup in README.md.'],
  DOWNLOAD_FORMAT_UNAVAILABLE: [422, 'No compatible MP4 video with audio is available at this quality or below. Try Best available.'],
  DOWNLOAD_FAILED: [422, 'The download could not be completed. Content may be unavailable or access-restricted.'],
  DOWNLOAD_TIMEOUT: [504, 'The download exceeded the time limit. Try a shorter video or a lower quality.'],
  DOWNLOAD_TOO_LARGE: [413, 'The video exceeds the configured download or temporary-storage limit.'],
  DOWNLOAD_BUSY: [503, 'The download service is at capacity. Please try again shortly.'],
  DOWNLOAD_FILE_MISSING: [500, 'The download did not produce a usable output file.'],
  DOWNLOAD_PROCESS_ERROR: [500, 'The server could not prepare the video. Please try again later.'],
});
export const downloadError = code => Object.assign(new Error(downloadErrors[code]?.[1] || downloadErrors.DOWNLOAD_PROCESS_ERROR[1]), { code });
export function sendDownloadError(res, error) {
  if (res.destroyed) return;
  if (res.headersSent) { res.destroy(); return; }
  const code = Object.hasOwn(downloadErrors, error?.code) ? error.code : 'DOWNLOAD_PROCESS_ERROR';
  const [status, message] = downloadErrors[code];
  if (code === 'DOWNLOAD_BUSY') res.setHeader('Retry-After', '5');
  res.status(status).json({ success: false, error: { code, message } });
}
