import dotenv from 'dotenv';

dotenv.config();

function positiveInteger(name, fallback, maximum) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw new Error(`Invalid ${name} configuration.`);
  return number;
}

export const env = Object.freeze({
  PORT: parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  BODY_LIMIT: process.env.BODY_LIMIT || '10kb',

  // Instagram Provider Configuration
  INSTAGRAM_PROVIDER: process.env.INSTAGRAM_PROVIDER || 'api',
  INSTAGRAM_API_KEY: process.env.INSTAGRAM_API_KEY || '',
  INSTAGRAM_API_BASE_URL: process.env.INSTAGRAM_API_BASE_URL || 'https://api.instagram-provider.example.com',
  INSTAGRAM_TIMEOUT_MS: parseInt(process.env.INSTAGRAM_TIMEOUT_MS, 10) || 10000,

  // YouTube Provider Configuration (Official YouTube Data API v3)
  YOUTUBE_PROVIDER: process.env.YOUTUBE_PROVIDER || 'api',
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',
  YOUTUBE_API_BASE_URL: process.env.YOUTUBE_API_BASE_URL || 'https://www.googleapis.com/youtube/v3',
  YOUTUBE_TIMEOUT_MS: parseInt(process.env.YOUTUBE_TIMEOUT_MS, 10) || 10000,

  // Authorized-Content Download Configuration
  // Whole-job deadline: processing plus response streaming.
  DOWNLOAD_TIMEOUT_MS: positiveInteger('DOWNLOAD_TIMEOUT_MS', 300000, 600000),
  // Maximum simultaneous yt-dlp processes
  DOWNLOAD_MAX_CONCURRENT: positiveInteger('DOWNLOAD_MAX_CONCURRENT', 2, 8),
  // Final file limit in MiB; the storage monitor allows twice this during merging.
  DOWNLOAD_MAX_FILE_SIZE_MB: positiveInteger('DOWNLOAD_MAX_FILE_SIZE_MB', 500, 2048),

  // Optional: override binary locations (useful if not on PATH)
  YTDLP_PATH:   process.env.YTDLP_PATH   || 'yt-dlp',
  FFMPEG_PATH:  process.env.FFMPEG_PATH  || 'ffmpeg',
  FFPROBE_PATH: process.env.FFPROBE_PATH || 'ffprobe',
});
