import { downloadVideo } from './api.js';
const disposers = new Set();
export function resetDownloads() {
  for (const dispose of disposers) dispose();
  disposers.clear();
}
addEventListener('pagehide', resetDownloads);
export function renderDownloadSection(analysis) {
  const section = document.createElement('section');
  section.className = 'download-section';
  section.setAttribute('aria-labelledby', 'download-heading');
  const heading = document.createElement('h3');
  heading.id = 'download-heading'; heading.className = 'download-heading';
  heading.textContent = 'Download authorized content';
  const qualityLabel = document.createElement('label');
  qualityLabel.htmlFor = 'download-quality'; qualityLabel.textContent = 'Maximum quality';
  const quality = document.createElement('select');
  quality.id = 'download-quality'; quality.className = 'download-quality-select';
  for (const value of ['best', '1080p', '720p', '480p', '360p']) {
    const option = document.createElement('option'); option.value = value;
    option.textContent = value === 'best' ? 'Best available compatible MP4' : `Up to ${value}`;
    quality.append(option);
  }
  const note = document.createElement('p'); note.className = 'media-permission-note';
  note.textContent = 'A lower quality may be used. Availability depends on the video; private, age-restricted and DRM-protected content are not supported.';
  const ack = document.createElement('label'); ack.className = 'download-ack-row';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox'; checkbox.id = 'download-authorized'; checkbox.className = 'download-checkbox';
  const label = document.createElement('span'); label.className = 'download-ack-label';
  label.textContent = 'I own this content or have permission to download it.';
  ack.append(checkbox, label);
  const button = document.createElement('button');
  button.type = 'button'; button.id = 'download-btn'; button.className = 'button primary download-btn';
  button.textContent = 'Download Video'; button.disabled = true;
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'button secondary';
  cancel.textContent = 'Cancel download'; cancel.hidden = true;
  const status = document.createElement('p'); status.id = 'download-status'; status.className = 'download-status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true'); status.hidden = true;
  const error = document.createElement('p'); error.id = 'download-error'; error.className = 'download-error';
  error.setAttribute('role', 'alert'); error.hidden = true;
  section.append(heading, qualityLabel, quality, note, ack, button, cancel, status, error);
  let controller, busy = false, disposed = false, blobUrl, revokeTimer;
  const dispose = () => { disposed = true; controller?.abort(); clearTimeout(revokeTimer); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  disposers.add(dispose);
  checkbox.addEventListener('change', () => { button.disabled = busy || !checkbox.checked; });
  cancel.addEventListener('click', () => controller?.abort());
  button.addEventListener('click', async () => {
    if (busy || !checkbox.checked || disposed) return;
    busy = true; controller = new AbortController();
    button.disabled = true; checkbox.disabled = true; quality.disabled = true;
    button.setAttribute('aria-busy', 'true'); button.textContent = 'Preparing video…';
    status.dataset.busy = 'true'; status.textContent = 'Preparing video…'; status.hidden = false;
    error.hidden = true; cancel.hidden = false;
    try {
      const result = await downloadVideo(analysis.normalizedUrl, quality.value, true, controller.signal);
      if (disposed) { if (result.blobUrl) URL.revokeObjectURL(result.blobUrl); return; }
      if (!result.success) {
        error.textContent = result.error.message; error.hidden = false; status.hidden = true;
      } else {
        blobUrl = result.blobUrl;
        const link = document.createElement('a'); link.href = blobUrl; link.download = result.filename;
        document.body.append(link); link.click(); link.remove();
        revokeTimer = setTimeout(() => { URL.revokeObjectURL(blobUrl); blobUrl = null; }, 10000);
        status.textContent = 'Download ready. Your browser will save the file.';
      }
    } catch {
      if (!disposed) { error.textContent = 'The download could not be completed. Please try again.'; error.hidden = false; status.hidden = true; }
    } finally {
      busy = false; controller = null;
      if (!disposed) {
        const returnFocus = document.activeElement === cancel;
        button.disabled = !checkbox.checked; checkbox.disabled = false; quality.disabled = false;
        button.setAttribute('aria-busy', 'false'); button.textContent = 'Download Video';
        status.dataset.busy = 'false'; cancel.hidden = true;
        if (returnFocus) button.focus();
      }
    }
  });
  return section;
}
