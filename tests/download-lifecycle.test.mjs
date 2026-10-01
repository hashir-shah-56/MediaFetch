import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createDownloadService, buildDownloadArguments } from '../server/services/download.service.js';
import { createDownloadController } from '../server/controllers/download.controller.js';
import { processEnvironment, runProcess } from '../server/utils/download-process.js';
import { detectDependencies } from '../server/utils/dependency-check.js';
const url = 'https://youtu.be/dQw4w9WgXcQ';
const body = { url, format: 'video', quality: '720p', authorized: true };
const deps = { ytdlp: true, ffmpeg: true, ffprobe: true, ytdlpPath: 'fixture-ytdlp', ffmpegPath: path.resolve('fixture-ffmpeg'), ffprobePath: 'fixture-ffprobe' };
const config = { DOWNLOAD_TIMEOUT_MS: 2000, DOWNLOAD_MAX_CONCURRENT: 1, DOWNLOAD_MAX_FILE_SIZE_MB: 1 };
const probe = { code: 0, stdout: JSON.stringify({ format: { format_name: 'mov,mp4' }, streams: [{ codec_type: 'video', codec_name: 'h264' }, { codec_type: 'audio', codec_name: 'aac' }] }), stderr: '' };
async function waitFor(predicate) {
  for (let i = 0; i < 150; i++) { if (await predicate()) return; await new Promise(r => setTimeout(r, 20)); }
  throw Error('Condition timed out');
}
async function harness(t, options = {}) {
  await fs.mkdir('.qa', { recursive: true });
  const base = await fs.mkdtemp(path.resolve('.qa/download-test-'));
  const calls = [];
  const run = options.run || (async (binary, args, settings) => {
    calls.push({ binary, args, settings });
    if (binary === deps.ffprobePath) return probe;
    await fs.writeFile(path.join(settings.cwd, 'media.mp4'), Buffer.from('test-only-file-not-real-media'));
    return { code: 0, stderr: '' };
  });
  const service = createDownloadService({ config: { ...config, ...options.config }, tempBase: base, run, dependencies: options.dependencies || (async () => deps) });
  const app = express(); app.use(express.json()); app.post('/download', createDownloadController(service));
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(async () => { service.shutdown(); await waitFor(() => service.activeDownloads() === 0); await new Promise(r => server.close(r)); await fs.rm(base, { recursive: true, force: true }); });
  const endpoint = `http://127.0.0.1:${server.address().port}/download`;
  const post = (data = body, signal) => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal });
  const clean = async () => { await waitFor(() => service.activeDownloads() === 0); assert.deepEqual(await fs.readdir(base), []); };
  return { base, endpoint, post, service, calls, clean };
}
test('streamed fixture success, canonical URL, controlled args, sanitized filename and cleanup', async t => {
  const h = await harness(t);
  const response = await h.post({ ...body, url: url + '?ignored=%22;%7C%24(echo)&list=bad' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="youtube-dQw4w9WgXcQ.mp4"');
  assert.ok((await response.arrayBuffer()).byteLength > 0);
  assert.equal(h.calls[0].args.at(-1), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(h.calls[0].args.at(-2), '--');
  assert.equal(h.calls[0].args[h.calls[0].args.indexOf('--output') + 1], 'media.%(ext)s');
  assert.ok(h.calls[0].args.includes('--ignore-config'));
  assert.ok(h.calls[0].args.includes('--no-plugin-dirs'));
  assert.ok(h.calls[0].args.includes('--no-remote-components'));
  assert.match(path.basename(h.calls[0].settings.cwd), /^[a-f0-9]{32}$/);
  await h.clean();
});
test('no browser control of binary, flags, paths, environment or trusted result fields', async t => {
  const h = await harness(t);
  for (const field of ['binary', 'args', 'output', 'postprocessorArgs', 'path', 'env', 'platform', 'mediaId', 'contentType', 'normalizedUrl']) {
    const response = await h.post({ ...body, [field]: '--exec bad' });
    assert.equal(response.status, 400, field);
  }
  for (const patch of [{ authorized: 'true' }, { authorized: false }, { format: 'audio' }, { quality: '--exec bad' }, { quality: {} }]) assert.ok((await h.post({ ...body, ...patch })).status >= 400);
  assert.equal(h.calls.length, 0);
});
for (const [name, code, stderr] of [['yt-dlp failure', 'DOWNLOAD_FAILED', 'private video internal/server/secret'], ['FFmpeg failure', 'DOWNLOAD_PROCESS_ERROR', 'ffmpeg internal/server/secret'], ['unavailable format', 'DOWNLOAD_FORMAT_UNAVAILABLE', 'Requested format is not available'], ['size precheck', 'DOWNLOAD_TOO_LARGE', 'File is larger than max-filesize']]) {
  test(`${name} is sanitized and cleaned`, async t => {
    const h = await harness(t, { run: async (binary, args, { cwd }) => { await fs.writeFile(path.join(cwd, 'partial.part'), 'partial'); return { code: 1, stderr }; } });
    const response = await h.post(); const json = await response.json();
    assert.equal(json.error.code, code); assert.ok(!JSON.stringify(json).includes('internal/server/secret')); await h.clean();
  });
}
test('missing file and wrong codec are rejected, never relabeled as MP4', async t => {
  const h = await harness(t, { run: async () => ({ code: 0, stderr: '' }) });
  assert.equal((await (await h.post()).json()).error.code, 'DOWNLOAD_FILE_MISSING'); await h.clean();
  const other = await harness(t, { run: async (binary, args, { cwd }) => {
    if (binary === deps.ffprobePath) return { ...probe, stdout: JSON.stringify({ format: { format_name: 'webm' }, streams: [] }) };
    await fs.writeFile(path.join(cwd, 'media.mp4'), 'not mp4'); return { code: 0, stderr: '' };
  } });
  assert.equal((await (await other.post()).json()).error.code, 'DOWNLOAD_FORMAT_UNAVAILABLE'); await other.clean();
});
test('each missing dependency produces setup guidance without launching a process', async t => {
  for (const dep of ['ytdlp', 'ffmpeg', 'ffprobe']) {
    const h = await harness(t, { dependencies: async () => ({ ...deps, [dep]: false }) });
    assert.equal((await (await h.post()).json()).error.code, 'DOWNLOAD_DEPENDENCY_MISSING');
    assert.equal(h.calls.length, 0); await h.clean();
  }
});
const hang = async (binary, args, { cwd, signal }) => {
  await fs.writeFile(path.join(cwd, 'partial.part'), 'partial');
  return new Promise((resolve, reject) => { if (signal.aborted) reject(signal.reason); else signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
};
test('timeout terminates work and cleans partial files', async t => {
  const h = await harness(t, { run: hang, config: { DOWNLOAD_TIMEOUT_MS: 80 } });
  assert.equal((await (await h.post()).json()).error.code, 'DOWNLOAD_TIMEOUT'); await h.clean();
});
test('atomic concurrency, busy rejection and exactly-once release', async t => {
  const h = await harness(t, { run: hang, config: { DOWNLOAD_TIMEOUT_MS: 300 } });
  const first = h.post(); await waitFor(() => h.service.activeDownloads() === 1);
  const second = await h.post(); assert.equal((await second.json()).error.code, 'DOWNLOAD_BUSY');
  assert.equal(h.service.activeDownloads(), 1);
  assert.equal((await (await first).json()).error.code, 'DOWNLOAD_TIMEOUT'); await h.clean();
});
test('client disconnect during processing cancels and cleans', async t => {
  const h = await harness(t, { run: hang });
  const controller = new AbortController(); const pending = h.post(body, controller.signal).catch(() => null);
  await waitFor(async () => (await fs.readdir(h.base)).length === 1); controller.abort(); await pending; await h.clean();
});
test('size monitor stops unknown-size growing files', async t => {
  const h = await harness(t, { run: async (binary, args, options) => {
    await fs.writeFile(path.join(options.cwd, 'growing.part'), Buffer.alloc(3 * 1024 * 1024));
    return hang(binary, args, options);
  } });
  assert.equal((await (await h.post()).json()).error.code, 'DOWNLOAD_TOO_LARGE'); await h.clean();
});
test('completed oversized file rejected and cleaned', async t => {
  const h = await harness(t, { run: async (binary, args, { cwd }) => { await fs.writeFile(path.join(cwd, 'media.mp4'), Buffer.alloc(1100000)); return { code: 0, stderr: '' }; } });
  assert.equal((await (await h.post()).json()).error.code, 'DOWNLOAD_TOO_LARGE'); await h.clean();
});
test('startup cleanup only removes stale owned job directories', async t => {
  const h = await harness(t);
  const stale = path.join(h.base, 'a'.repeat(32)); const fresh = path.join(h.base, 'b'.repeat(32));
  await fs.mkdir(stale); await fs.mkdir(fresh); await fs.writeFile(path.join(h.base, 'keep.txt'), 'keep');
  const old = new Date(Date.now() - 172800000); await fs.utimes(stale, old, old);
  await h.service.initialize();
  assert.deepEqual((await fs.readdir(h.base)).sort(), ['b'.repeat(32), 'keep.txt'].sort());
});
test('real process runner treats shell syntax as literal args and strips environment secrets', async () => {
  const cwd = path.resolve('.qa');
  process.env.YOUTUBE_API_KEY = 'test-secret-not-a-real-key'; process.env.NODE_OPTIONS_TEST_SENTINEL = 'hidden';
  const arg = '";|$(echo unsafe)`test`';
  const result = await runProcess(process.execPath, ['-e', 'console.log(JSON.stringify({arg:process.argv[1],secret:process.env.YOUTUBE_API_KEY,proxy:process.env.HTTPS_PROXY}))', arg], { cwd });
  // capture must be explicitly opted in.
  assert.equal(result.stdout, '');
  const captured = await runProcess(process.execPath, ['-e', 'console.log(JSON.stringify({arg:process.argv[1],secret:process.env.YOUTUBE_API_KEY}))', arg], { cwd, captureStdout: true });
  assert.deepEqual(JSON.parse(captured.stdout), { arg });
  assert.equal(processEnvironment(cwd).YOUTUBE_API_KEY, undefined);
  assert.equal(processEnvironment(cwd).NODE_OPTIONS, undefined);
});
test('real hung process is killed on timeout', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { cwd: path.resolve('.qa'), signal: AbortSignal.timeout(150) }));
});
test('controlled formats always require H264/AAC, never raw fallback', () => {
  for (const quality of ['best', '1080p', '720p', '480p', '360p']) {
    const args = buildDownloadArguments('dQw4w9WgXcQ', quality, deps, config);
    const format = args[args.indexOf('--format') + 1]; assert.match(format, /avc1/); assert.match(format, /mp4a/);
    if (quality !== 'best') assert.match(format, new RegExp('height<=' + quality.slice(0, -1)));
  }
});
test('actual FFmpeg creates and ffprobe verifies developer-generated test media', async () => {
  const tools = await detectDependencies();
  assert.ok(tools.ffmpeg && tools.ffprobe && tools.ytdlp, 'Development tools must be installed');
  const cwd = path.resolve('.qa');
  const result = await runProcess(tools.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=navy:s=160x90:r=10', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-t', '0.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', 'synthetic.mp4'],
    { cwd, signal: AbortSignal.timeout(15000) });
  assert.equal(result.code, 0);
  const info = await runProcess(tools.ffprobePath, ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'json', 'synthetic.mp4'], { cwd, captureStdout: true });
  const codecs = JSON.parse(info.stdout).streams.map(s => s.codec_name);
  assert.ok(codecs.includes('h264') && codecs.includes('aac'));
});
test('real cancellation kills a spawned descendant as well as the parent', async () => {
  const cwd = path.resolve('.qa'); const pidFile = path.join(cwd, 'process-tree-test.pid');
  await fs.rm(pidFile, { force: true });
  const code = 'const {spawn}=require("node:child_process"); const fs=require("node:fs"); const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});fs.writeFileSync(process.argv[1],String(c.pid));setInterval(()=>{},1000);';
  const controller = new AbortController();
  const pending = runProcess(process.execPath, ['-e', code, pidFile], { cwd, signal: controller.signal }).catch(() => null);
  await waitFor(async () => { try { return (await fs.stat(pidFile)).size > 0; } catch { return false; } });
  const pid = Number(await fs.readFile(pidFile, 'utf8'));
  controller.abort(); await pending;
  await waitFor(() => { try { process.kill(pid, 0); return false; } catch { return true; } });
  await fs.rm(pidFile, { force: true });
});
test('disconnect during streaming closes the stream and removes output', async t => {
  const h = await harness(t, { config: { DOWNLOAD_MAX_FILE_SIZE_MB: 32 }, run: async (binary, args, { cwd }) => {
    if (binary === deps.ffprobePath) return probe;
    await fs.writeFile(path.join(cwd, 'media.mp4'), Buffer.alloc(16 * 1024 * 1024)); return { code: 0, stderr: '' };
  } });
  await new Promise((resolve, reject) => {
    const request = http.request(h.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, response => {
      response.once('data', () => { response.destroy(); request.destroy(); resolve(); });
    }); request.on('error', error => { if (error.code !== 'ECONNRESET') reject(error); }); request.end(JSON.stringify(body));
  });
  await h.clean();
});
