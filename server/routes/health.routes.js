import { Router } from 'express';
import { detectDependencies } from '../utils/dependency-check.js';
import { activeDownloads } from '../services/download.service.js';
import { env } from '../config/env.js';

const router = Router();

router.get('/health', async (req, res) => {
  const deps = await detectDependencies();

  res.status(200).json({
    success: true,
    status: 'ok',
    service: 'MediaFetch API',
    subsystems: {
      instagram: { status: 'ok' },
      youtube:   { status: 'ok' },
      download: {
        status: deps.ytdlp && deps.ffmpeg && deps.ffprobe ? 'ok' : 'degraded',
        ytdlp:   { installed: deps.ytdlp,   version: deps.ytdlpVersion },
        ffmpeg:  { installed: deps.ffmpeg,  version: deps.ffmpegVersion },
        ffprobe: { installed: deps.ffprobe, version: deps.ffprobeVersion },
        activeJobs: activeDownloads(),
        maxConcurrent: env.DOWNLOAD_MAX_CONCURRENT
      }
    }
  });
});

export default router;

