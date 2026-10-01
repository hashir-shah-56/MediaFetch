import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { env } from '../config/env.js';
import { runProcess } from './download-process.js';
let cached;
let cachedAt = 0;
async function resolveBinary(name) {
  const candidates = path.isAbsolute(name) ? [name] : name.includes('/') || name.includes('\\') ? [path.resolve(name)]
    : (process.env.PATH || '').split(path.delimiter).filter(Boolean).flatMap(directory => process.platform === 'win32' && !name.toLowerCase().endsWith('.exe') ? [path.join(directory, `${name}.exe`)] : [path.join(directory, name)]);
  for (const candidate of candidates) {
    try { if ((await fs.stat(candidate)).isFile()) return candidate; } catch {}
  }
  return null;
}
async function probe(name, args, pattern) {
  const binary = await resolveBinary(name);
  if (!binary) return { installed: false, path: null, version: null };
  try {
    const result = await runProcess(binary, args, { cwd: os.tmpdir(), signal: AbortSignal.timeout(15000), captureStdout: true });
    const version = result.stdout.match(pattern)?.[1];
    return result.code === 0 && version ? { installed: true, path: binary, version } : { installed: false, path: null, version: null };
  } catch { return { installed: false, path: null, version: null }; }
}
export async function detectDependencies(force = false) {
  if (!force && cached && Date.now() - cachedAt < 60000) return cached;
  cachedAt = Date.now();
  cached = Promise.all([
    probe(env.YTDLP_PATH, ['--ignore-config', '--no-plugin-dirs', '--version'], /^(\d{4}\.\d{2}\.\d{2}[^\s]*)/),
    probe(env.FFMPEG_PATH, ['-version'], /ffmpeg version ([^\s]+)/),
    probe(env.FFPROBE_PATH, ['-version'], /ffprobe version ([^\s]+)/),
  ]).then(([yt, ff, fp]) => ({ ytdlp: yt.installed, ytdlpPath: yt.path, ytdlpVersion: yt.version,
    ffmpeg: ff.installed, ffmpegPath: ff.path, ffmpegVersion: ff.version,
    ffprobe: fp.installed, ffprobePath: fp.path, ffprobeVersion: fp.version }));
  return cached;
}
