import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { analyzeUrl } from '../utils/url-parser.js';
import { detectDependencies } from '../utils/dependency-check.js';
import { runProcess } from '../utils/download-process.js';
import { downloadError, sendDownloadError } from '../utils/download-errors.js';
export const VALID_QUALITIES = new Set(['best', '1080p', '720p', '480p', '360p']);
export const DEFAULT_QUALITY = 'best';
const TEMP_BASE = fileURLToPath(new URL('../../temp/download-jobs', import.meta.url));
const jobName = /^[a-f0-9]{32}$/;
export function buildDownloadArguments(mediaId, quality, deps, config) {
  const cap = quality === 'best' ? '' : `[height<=${quality.slice(0, -1)}]`;
  const format = `bv[ext=mp4][vcodec^=avc1]${cap}+ba[ext=m4a][acodec^=mp4a]/b[ext=mp4][vcodec^=avc1][acodec^=mp4a]${cap}`;
  return ['--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--no-remote-components',
    '--no-cookies', '--no-playlist', '--no-progress', '--no-warnings',
    '--no-color', '--no-mtime', '--socket-timeout', '20', '--retries', '2', '--fragment-retries', '2',
    '--concurrent-fragments', '1', '--use-extractors', 'youtube', '--age-limit', '17',
    '--match-filter', '!is_live & !is_upcoming', '--no-js-runtimes', '--js-runtimes', `node:${process.execPath}`,
    '--ffmpeg-location', path.dirname(deps.ffmpegPath), '--format', format,
    '--merge-output-format', 'mp4', '--max-filesize', String(config.DOWNLOAD_MAX_FILE_SIZE_MB * 1024 * 1024),
    '--output', 'media.%(ext)s', '--', `https://www.youtube.com/watch?v=${mediaId}`];
}
async function directorySize(directory) {
  let bytes = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    let stat;
    try { stat = await fs.lstat(target); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink()) throw downloadError('DOWNLOAD_PROCESS_ERROR');
    bytes += stat.isDirectory() ? await directorySize(target) : stat.size;
  }
  return bytes;
}
function classify(stderr) {
  if (/max-filesize|larger than|file size.*limit/i.test(stderr)) return 'DOWNLOAD_TOO_LARGE';
  if (/requested format|no video formats|does not pass filter|age restricted/i.test(stderr)) return 'DOWNLOAD_FORMAT_UNAVAILABLE';
  if (/ffmpeg|postprocess/i.test(stderr)) return 'DOWNLOAD_PROCESS_ERROR';
  return 'DOWNLOAD_FAILED';
}
/** Test infrastructure injection is never available through request data. */
export function createDownloadService({ config = env, tempBase = TEMP_BASE, run = runProcess, dependencies = detectDependencies } = {}) {
  let active = 0;
  const controllers = new Set();
  let ready;
  const base = path.resolve(tempBase);
  async function init() {
    await fs.mkdir(base, { recursive: true, mode: 0o700 });
    const real = path.resolve(await fs.realpath(base));
    const expected = process.platform === 'win32' ? base.toLowerCase() : base;
    if ((await fs.lstat(base)).isSymbolicLink() || (process.platform === 'win32' ? real.toLowerCase() : real) !== expected) throw downloadError('DOWNLOAD_PROCESS_ERROR');
    for (const entry of await fs.readdir(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || !jobName.test(entry.name)) continue;
      const target = path.resolve(base, entry.name);
      if (path.dirname(target) !== base) continue;
      const stat = await fs.lstat(target);
      if (!stat.isSymbolicLink() && Date.now() - stat.mtimeMs > Math.max(86400000, config.DOWNLOAD_TIMEOUT_MS * 2)) await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
  const initialize = () => ready ||= init().catch(error => { ready = null; throw error; });
  async function download(url, { authorized, quality = DEFAULT_QUALITY }, req, res) {
    const parsed = analyzeUrl(url);
    if (authorized !== true) return sendDownloadError(res, downloadError('DOWNLOAD_NOT_AUTHORIZED'));
    if (!parsed.valid || parsed.platform !== 'youtube' || !['youtube_video', 'youtube_short'].includes(parsed.contentType) || !VALID_QUALITIES.has(quality)) return sendDownloadError(res, downloadError('DOWNLOAD_FORMAT_UNAVAILABLE'));
    // Reserve before any await; hold through streaming and cleanup, release exactly once.
    if (active >= config.DOWNLOAD_MAX_CONCURRENT) return sendDownloadError(res, downloadError('DOWNLOAD_BUSY'));
    active++;
    const controller = new AbortController(); controllers.add(controller);
    const { signal } = controller;
    let jobDir, monitor, checking = Promise.resolve(), monitoring = false;
    const cancel = () => { if (!res.writableFinished) controller.abort(downloadError('DOWNLOAD_FAILED')); };
    req.once('aborted', cancel); res.once('close', cancel);
    const timer = setTimeout(() => controller.abort(downloadError('DOWNLOAD_TIMEOUT')), config.DOWNLOAD_TIMEOUT_MS);
    const checkAbort = () => { if (signal.aborted) throw signal.reason; };
    try {
      if (req.aborted || res.destroyed) cancel();
      await initialize(); checkAbort();
      const deps = await dependencies(); checkAbort();
      if (!deps.ytdlp || !deps.ffmpeg || !deps.ffprobe) throw downloadError('DOWNLOAD_DEPENDENCY_MISSING');
      jobDir = path.join(base, crypto.randomBytes(16).toString('hex'));
      await fs.mkdir(jobDir, { mode: 0o700 }); checkAbort();
      const limit = config.DOWNLOAD_MAX_FILE_SIZE_MB * 1024 * 1024;
      monitor = setInterval(() => {
        if (monitoring) return;
        monitoring = true;
        checking = directorySize(jobDir).then(size => { if (size > limit * 2) controller.abort(downloadError('DOWNLOAD_TOO_LARGE')); })
          .catch(() => controller.abort(downloadError('DOWNLOAD_PROCESS_ERROR'))).finally(() => { monitoring = false; });
      }, 250);
      const output = await run(deps.ytdlpPath, buildDownloadArguments(parsed.mediaId, quality, deps, config), { cwd: jobDir, signal });
      checkAbort();
      if (/max-filesize|larger than/i.test(output.stderr)) throw downloadError('DOWNLOAD_TOO_LARGE');
      if (output.code !== 0) throw downloadError(classify(output.stderr));
      const file = path.join(jobDir, 'media.mp4');
      let stat;
      try { stat = await fs.lstat(file); } catch { throw downloadError('DOWNLOAD_FILE_MISSING'); }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw downloadError('DOWNLOAD_FILE_MISSING');
      if (stat.size > limit) throw downloadError('DOWNLOAD_TOO_LARGE');
      const probe = await run(deps.ffprobePath, ['-v', 'error', '-show_entries', 'format=format_name:stream=codec_type,codec_name', '-of', 'json', file], { cwd: jobDir, signal, captureStdout: true });
      checkAbort();
      let info;
      try { info = JSON.parse(probe.stdout); } catch { throw downloadError('DOWNLOAD_PROCESS_ERROR'); }
      if (probe.code !== 0 || !info.format?.format_name?.split(',').includes('mp4') || !info.streams?.some(s => s.codec_type === 'video' && s.codec_name === 'h264') || !info.streams?.some(s => s.codec_type === 'audio' && s.codec_name === 'aac')) throw downloadError('DOWNLOAD_FORMAT_UNAVAILABLE');
      clearInterval(monitor); await checking; checkAbort();
      res.set({ 'Content-Type': 'video/mp4', 'Content-Disposition': `attachment; filename="youtube-${parsed.mediaId}.mp4"`, 'Content-Length': String(stat.size), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      await pipeline(createReadStream(file), res, { signal });
    } catch (error) { sendDownloadError(res, signal.aborted ? signal.reason : error); }
    finally {
      clearTimeout(timer); clearInterval(monitor);
      req.removeListener('aborted', cancel); res.removeListener('close', cancel); await checking;
      if (jobDir) {
        try { await fs.rm(jobDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
        catch { console.error('[DownloadCleanup] Temporary job cleanup failed; stale-job recovery is required.'); }
      }
      controllers.delete(controller); active--;
    }
  }
  return { initialize, download, activeDownloads: () => active, shutdown: () => { for (const controller of controllers) controller.abort(downloadError('DOWNLOAD_FAILED')); } };
}
export const downloadService = createDownloadService();
export const initDownloadService = downloadService.initialize;
export const activeDownloads = downloadService.activeDownloads;
