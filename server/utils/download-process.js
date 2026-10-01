import { spawn } from 'node:child_process';
import path from 'node:path';

/** Deliberate environment allowlist: never pass provider keys, cookies or proxy settings. */
export function processEnvironment(directory) {
  const result = {};
  for (const name of ['PATH', 'SystemRoot', 'WINDIR', 'PATHEXT', 'LANG', 'LC_ALL']) {
    const key = Object.keys(process.env).find(key => key.toLowerCase() === name.toLowerCase());
    if (key) result[name] = process.env[key];
  }
  return { ...result, HOME: directory, USERPROFILE: directory, TMP: directory, TEMP: directory,
    TMPDIR: directory, XDG_CACHE_HOME: directory, XDG_CONFIG_HOME: directory, PYTHONNOUSERSITE: '1' };
}

/** Terminate the entire owned process tree, including ffmpeg and the JS runtime. */
export function killProcessTree(child) {
  if (!child.pid) return Promise.resolve();
  if (process.platform !== 'win32') {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
      ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore', env: processEnvironment(process.cwd()) });
    killer.once('error', () => { try { child.kill(); } catch {} resolve(); });
    killer.once('close', resolve);
  });
}

/** Bounded output, explicit argument arrays, no shell. Resolves only once pipes close. */
export async function runProcess(binary, args, { cwd, signal, captureStdout = false } = {}) {
  if (signal?.aborted) throw signal.reason;
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { shell: false, windowsHide: true,
      detached: process.platform !== 'win32', cwd, env: processEnvironment(cwd),
      stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', 'pipe'] });
    let stdout = '', stderr = '', spawnError;
    let termination = Promise.resolve();
    const abort = () => { termination = killProcessTree(child); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout?.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(0, 65536); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(0, 4096); });
    child.once('error', error => { spawnError = error; });
    child.once('close', async code => {
      signal?.removeEventListener('abort', abort);
      await termination;
      if (signal?.aborted) reject(signal.reason);
      else if (spawnError) reject(Object.assign(new Error('Process could not start.'), { code: 'DOWNLOAD_PROCESS_ERROR' }));
      else resolve({ code, stdout, stderr });
    });
  });
}
