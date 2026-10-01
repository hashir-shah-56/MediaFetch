import { debounce } from './utils.js';
import { analyzeUrl } from './url-parser.js';
import { analyzeMediaUrl } from './api.js';
import { initNavigation, initFaq, notify, setInputState, setProcessing, renderDetection, showResult } from './ui.js';

const input = document.querySelector('#media-url');
const paste = document.querySelector('#paste-button');
const defaultMessage = 'Paste an Instagram or YouTube media link. https:// is optional.';
let currentAnalysis = null;
let editRevision = 0;
let composing = false;
let isSubmitting = false;

const delayedValidation = debounce(() => checkInput(), 300);

initNavigation();
initFaq();
setProcessing(false);
setInputState('empty', defaultMessage);
document.querySelector('#year').textContent = String(new Date().getFullYear());

function checkInput({ submitting = false } = {}) {
  delayedValidation.cancel();
  setInputState('validating', 'Checking URL locally…');
  currentAnalysis = analyzeUrl(input.value);
  renderDetection(currentAnalysis);

  if (currentAnalysis.valid) {
    setInputState('valid', '✓ URL pattern verified. Ready to analyze.');
  } else {
    const { code, message } = currentAnalysis.error;
    const state = code === 'EMPTY_URL' && !submitting ? 'empty'
      : ['UNSUPPORTED_PLATFORM', 'UNSUPPORTED_INSTAGRAM_TYPE', 'UNSUPPORTED_YOUTUBE_TYPE'].includes(code) ? 'unsupported' : 'invalid';
    setInputState(state, state === 'empty' ? defaultMessage : message);
  }
  return currentAnalysis;
}

function onEdit() {
  editRevision++;
  currentAnalysis = null;
  renderDetection(null);
  delayedValidation.cancel();
  setInputState(input.value.trim() ? 'typing' : 'empty', input.value.trim() ? 'Finish entering your media link…' : defaultMessage);
  if (!composing && input.value.trim()) delayedValidation();
}

input.addEventListener('input', onEdit);
input.addEventListener('compositionstart', () => { composing = true; delayedValidation.cancel(); });
input.addEventListener('compositionend', () => { composing = false; onEdit(); });
input.addEventListener('blur', () => { if (!composing && !currentAnalysis && !isSubmitting) checkInput(); });

document.querySelector('#url-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (composing || isSubmitting) return;

  const analysis = checkInput({ submitting: true });
  if (!analysis.valid) {
    input.focus();
    notify(analysis.error.message, 'error');
    return;
  }

  isSubmitting = true;
  setProcessing(true);

  try {
    const response = await analyzeMediaUrl(input.value);

    if (response.success) {
      showResult(response.data);
      notify('Media information loaded.', 'information');
    } else {
      setInputState('invalid', response.error.message);
      notify(response.error.message, 'error');
      input.focus();
    }
  } catch (err) {
    const message = "MediaFetch couldn't reach the analysis service. Please try again.";
    setInputState('invalid', message);
    notify(message, 'error');
    input.focus();
  } finally {
    isSubmitting = false;
    setProcessing(false);
  }
});

paste.addEventListener('click', async () => {
  if (!window.isSecureContext || !navigator.clipboard?.readText) {
    notify('Clipboard access is unavailable here. Paste directly into the URL field using your keyboard or touch menu.', 'warning');
    input.focus();
    return;
  }
  const revisionBeforeRead = editRevision;
  paste.disabled = true;
  paste.textContent = 'Reading…';
  try {
    const text = await navigator.clipboard.readText();
    if (editRevision !== revisionBeforeRead) {
      notify('Your URL changed while clipboard access was pending. Paste again if you want to replace it.', 'information');
      return;
    }
    if (!text.trim()) {
      notify('Your clipboard has no text. Copy a URL, then try again.', 'warning');
      return;
    }
    if (text.trim().length > 2048) {
      notify('The clipboard text is too long. Paste a URL with 2,048 characters or fewer.', 'warning');
      return;
    }
    input.value = text.trim();
    editRevision++;
    const analysis = checkInput({ submitting: true });
    notify(analysis.valid ? 'Link pasted and recognized. Click Analyze Media to verify.' : analysis.error.message, analysis.valid ? 'success' : 'error');
  } catch {
    notify('Clipboard access was denied or could not be read. Paste directly into the URL field using your keyboard or touch menu.', 'warning');
  } finally {
    paste.disabled = false;
    paste.textContent = 'Paste';
    input.focus();
  }
});
