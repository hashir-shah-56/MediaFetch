import { renderDownloadSection, resetDownloads } from './download.js';
const region = document.querySelector('#toast-region');
const announcer = document.querySelector('#toast-announcer');
let announcementTimer;

/** All content is inserted as text. Notifications remain until dismissed. */
export function notify(message, type = 'information') {
  const allowedTypes = ['success', 'information', 'warning', 'error'];
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.dataset.type = allowedTypes.includes(type) ? type : 'information';
  const text = document.createElement('p');
  text.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.addEventListener('click', () => {
    if (toast.contains(document.activeElement)) document.querySelector('#media-url').focus();
    toast.remove();
  });
  // Keep the small-screen interface visible; the inline feedback preserves important details.
  region.querySelectorAll('.toast').forEach(item => item.remove());
  toast.append(text, close);
  region.append(toast);
  clearTimeout(announcementTimer);
  announcer.textContent = '';
  announcementTimer = setTimeout(() => { announcer.textContent = message; }, 50);
}

export function setInputState(state, message) {
  document.querySelector('#analyzer').dataset.state = state;
  document.querySelector('#media-url').setAttribute('aria-invalid', String(['invalid', 'unsupported'].includes(state)));
  document.querySelector('#url-feedback').textContent = message;
}

const contentLabels = Object.freeze({ instagram_post: 'Instagram Post', instagram_reel: 'Instagram Reel', instagram_video: 'Instagram Video', youtube_video: 'YouTube Video', youtube_short: 'YouTube Short' });
export function renderDetection(analysis) {
  resetDownloads();
  document.querySelector('#result').hidden = true;
  const indicator = document.querySelector('#detected-platform');
  indicator.hidden = !analysis?.valid;
  indicator.textContent = analysis?.valid ? `✓ ${contentLabels[analysis.contentType]} detected` : '';
  document.querySelectorAll('[data-platform]').forEach(element => {
    const selected = analysis?.valid && element.dataset.platform === analysis.platform;
    element.classList.toggle('detected', Boolean(selected));
    element.textContent = `${selected ? '✓' : '○'} ${element.dataset.platform === 'instagram' ? 'Instagram' : 'YouTube'}`;
  });
}
export function showResult(analysis) {
  resetDownloads();
  const resultContainer = document.querySelector('#result');
  resultContainer.replaceChildren();

  const isInstagramMedia = analysis.platform === 'instagram' && Array.isArray(analysis.media) && analysis.media.length > 0;

  if (isInstagramMedia) {
    resultContainer.className = 'result instagram-result';

    // Header section: Badge + Content Type + Author
    const header = document.createElement('div');
    header.className = 'media-card-header';

    const badge = document.createElement('span');
    badge.className = 'media-type-badge';
    badge.textContent = `✓ ${contentLabels[analysis.contentType] || 'Instagram Media'}`;
    header.appendChild(badge);

    if (analysis.metadata?.author) {
      const author = document.createElement('span');
      author.className = 'media-author';
      author.textContent = analysis.metadata.author;
      header.appendChild(author);
    }
    resultContainer.appendChild(header);

    // Caption if present
    if (analysis.metadata?.caption) {
      const caption = document.createElement('p');
      caption.className = 'media-caption';
      caption.textContent = analysis.metadata.caption;
      resultContainer.appendChild(caption);
    }

    // Media Gallery container
    const gallery = document.createElement('div');
    gallery.className = analysis.media.length > 1 ? 'media-gallery multiple' : 'media-gallery single';

    analysis.media.forEach((item, index) => {
      const itemCard = document.createElement('div');
      itemCard.className = 'media-item';

      if (analysis.media.length > 1) {
        const itemLabel = document.createElement('span');
        itemLabel.className = 'media-item-label';
        itemLabel.textContent = `Item ${index + 1} of ${analysis.media.length} (${item.type === 'video' ? 'Video' : 'Image'})`;
        itemCard.appendChild(itemLabel);
      }

      // Media element (video or image)
      if (item.type === 'video') {
        const video = document.createElement('video');
        video.controls = true;
        video.preload = 'metadata';
        if (analysis.metadata?.thumbnail) {
          video.poster = analysis.metadata.thumbnail;
        }
        const source = document.createElement('source');
        source.src = item.url;
        source.type = 'video/mp4';
        video.appendChild(source);
        itemCard.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = `Instagram media ${index + 1}`;
        img.loading = 'lazy';
        img.onerror = () => {
          img.alt = 'Media preview could not be loaded.';
        };
        itemCard.appendChild(img);
      }

      // Action / Save Button
      const actionRow = document.createElement('div');
      actionRow.className = 'media-item-actions';

      const saveLink = document.createElement('a');
      saveLink.href = item.url;
      saveLink.className = 'button primary media-save-button';
      saveLink.target = '_blank';
      saveLink.rel = 'noopener noreferrer';
      saveLink.download = item.fileName || `instagram-media-${analysis.mediaId}-${index + 1}.${item.type === 'video' ? 'mp4' : 'jpg'}`;
      saveLink.textContent = item.type === 'video' ? 'Save Video ↗' : 'Save Image ↗';

      actionRow.appendChild(saveLink);
      itemCard.appendChild(actionRow);
      gallery.appendChild(itemCard);
    });

    resultContainer.appendChild(gallery);

    // Footer notice
    const note = document.createElement('p');
    note.className = 'media-permission-note';
    note.textContent = 'Only save media you own or have permission to use.';
    resultContainer.appendChild(note);

  } else if (analysis.platform === 'youtube' && analysis.metadata && analysis.capabilities?.metadata === true) {
    resultContainer.className = 'result youtube-result';

    // Header section: Badge + Duration
    const header = document.createElement('div');
    header.className = 'media-card-header';

    const badge = document.createElement('span');
    badge.className = 'media-type-badge';
    badge.textContent = `✓ ${contentLabels[analysis.contentType] || 'YouTube Video'}`;
    header.appendChild(badge);

    if (analysis.metadata.duration) {
      const durationBadge = document.createElement('span');
      durationBadge.className = 'media-author';
      durationBadge.textContent = `Duration: ${analysis.metadata.duration}`;
      header.appendChild(durationBadge);
    }
    resultContainer.appendChild(header);

    // Thumbnail
    if (analysis.metadata.thumbnail) {
      const img = document.createElement('img');
      img.src = analysis.metadata.thumbnail;
      img.alt = analysis.metadata.title ? `${analysis.metadata.title} thumbnail` : 'YouTube video thumbnail';
      img.className = 'youtube-thumbnail';
      img.loading = 'lazy';
      img.onerror = () => {
        img.alt = 'Thumbnail preview could not be loaded.';
      };
      resultContainer.appendChild(img);
    }

    // Title
    const title = document.createElement('h2');
    title.className = 'youtube-title';
    title.textContent = analysis.metadata.title || 'YouTube Video';
    resultContainer.appendChild(title);

    // Metadata details row
    const metaRow = document.createElement('div');
    metaRow.className = 'youtube-meta-row';

    if (analysis.metadata.channelTitle) {
      const channelItem = document.createElement('span');
      channelItem.className = 'youtube-meta-item';
      channelItem.textContent = 'Channel: ';
      const channelBold = document.createElement('strong');
      channelBold.textContent = analysis.metadata.channelTitle;
      channelItem.appendChild(channelBold);
      metaRow.appendChild(channelItem);
    }

    if (analysis.metadata.publishedAt) {
      const dateItem = document.createElement('span');
      dateItem.className = 'youtube-meta-item';
      dateItem.textContent = 'Published: ';
      const dateBold = document.createElement('strong');
      try {
        dateBold.textContent = new Date(analysis.metadata.publishedAt).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      } catch {
        dateBold.textContent = analysis.metadata.publishedAt;
      }
      dateItem.appendChild(dateBold);
      metaRow.appendChild(dateItem);
    }
    resultContainer.appendChild(metaRow);

    // Description snippet
    if (analysis.metadata.description) {
      const desc = document.createElement('p');
      desc.className = 'youtube-description';
      desc.textContent = analysis.metadata.description;
      resultContainer.appendChild(desc);
    }

    // Action: Open on YouTube
    const actionRow = document.createElement('div');
    actionRow.className = 'media-item-actions';

    const openLink = document.createElement('a');
    openLink.href = analysis.normalizedUrl;
    openLink.className = 'button primary youtube-open-button';
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    openLink.textContent = 'Open on YouTube ↗';

    actionRow.appendChild(openLink);
    resultContainer.appendChild(actionRow);

    // Download section for authorized content
    resultContainer.appendChild(renderDownloadSection(analysis));

  } else {
    // Standard verification result (capability: metadata false)
    resultContainer.className = 'result standard-result';

    const symbol = document.createElement('span');
    symbol.className = 'result-symbol';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = 'i';
    resultContainer.appendChild(symbol);

    const contentDiv = document.createElement('div');
    const title = document.createElement('h2');
    title.id = 'result-title';
    title.textContent = `${contentLabels[analysis.contentType] || 'Media'} URL verified`;
    contentDiv.appendChild(title);

    const desc = document.createElement('p');
    desc.textContent = 'URL verified. Media retrieval will be available after backend integration. No media has been retrieved. Existence and access have not been checked.';
    contentDiv.appendChild(desc);

    const dl = document.createElement('dl');
    const dt1 = document.createElement('dt');
    dt1.textContent = 'Media identifier';
    const dd1 = document.createElement('dd');
    dd1.id = 'result-id';
    dd1.textContent = analysis.mediaId;
    dl.appendChild(dt1);
    dl.appendChild(dd1);

    const dt2 = document.createElement('dt');
    dt2.textContent = 'Normalized URL';
    const dd2 = document.createElement('dd');
    dd2.id = 'result-url';
    dd2.textContent = analysis.normalizedUrl;
    dl.appendChild(dt2);
    dl.appendChild(dd2);

    contentDiv.appendChild(dl);
    resultContainer.appendChild(contentDiv);
  }

  resultContainer.hidden = false;
}
/** Ready for a real asynchronous integration; local analysis never simulates retrieval. */
export function setProcessing(isProcessing) {
  const form = document.querySelector('#url-form');
  form.setAttribute('aria-busy', String(isProcessing));
  form.querySelectorAll('input, button').forEach(control => { control.disabled = isProcessing; });
  document.querySelector('#analyze-label').textContent = isProcessing ? 'Analyzing…' : 'Analyze Media';
  document.querySelector('.spinner').hidden = !isProcessing;
}

export function initNavigation() {
  const toggle = document.querySelector('#menu-toggle');
  const nav = document.querySelector('#primary-nav');
  const mobile = matchMedia('(max-width: 767px)');
  function closeMenu(returnFocus = false) {
    toggle.setAttribute('aria-expanded', 'false');
    nav.hidden = mobile.matches;
    if (returnFocus) toggle.focus();
  }
  function sync() {
    const focusInNav = nav.contains(document.activeElement);
    const focusOnToggle = document.activeElement === toggle;
    toggle.hidden = !mobile.matches;
    closeMenu(mobile.matches && focusInNav);
    if (!mobile.matches && focusOnToggle) nav.querySelector('a').focus();
  }
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    nav.hidden = !open;
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    closeMenu();
    const target = document.querySelector(link.hash);
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobile.matches && !nav.hidden) closeMenu(true);
  });
  document.addEventListener('click', event => {
    if (mobile.matches && !nav.hidden && !document.querySelector('.header-inner').contains(event.target)) {
      closeMenu(nav.contains(document.activeElement));
    }
  });
  mobile.addEventListener('change', sync);
  sync();
  const updateHeader = () => document.querySelector('#site-header').classList.toggle('scrolled', scrollY > 12);
  addEventListener('scroll', updateHeader, { passive: true });
  updateHeader();
}

export function initFaq() {
  const buttons = [...document.querySelectorAll('.faq-item button')];
  buttons.forEach((button, index) => {
    const answer = document.getElementById(button.getAttribute('aria-controls'));
    button.setAttribute('aria-expanded', 'false');
    answer.hidden = true;
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      answer.hidden = !open;
    });
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
      if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (next !== undefined) { event.preventDefault(); buttons[next].focus(); }
    });
  });
}
