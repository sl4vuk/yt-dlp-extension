/* ui.js — YT Bookmark Cleaner v2.6 */
'use strict';

const store = {
  get: k => new Promise(r => chrome.storage.local.get(k, r)),
  set: o => new Promise(r => chrome.storage.local.set(o, r)),
};

const $ = id => document.getElementById(id);
const html = document.documentElement;
const folderSel = $('folderSelect');
const totalNum = $('total-num');
const syncStats = $('sync-stats');
const sScanned = $('s-scanned');
const sSynced = $('s-synced');
const sSkipped = $('s-skipped');
const btnSync = $('btn-sync');
const btnDownload = $('btn-download');
const btnTheme = $('btn-theme');
const iconMoon = $('icon-moon');
const iconSun = $('icon-sun');
const pathInput = $('path-input');
const pathBrowse = $('path-browse');
const dlBar = $('dl-bar');
const dlFilename = $('dl-filename');
const dlSize = $('dl-size');
const dlEta = $('dl-eta');
const dlCurrent = $('dl-current');
const dlTotal = $('dl-total');
const dlPct = $('dl-pct');
const dlLog = $('dl-log');
const toastEl = $('toast');
const exportToggle = $('export-toggle');
const exportBody = $('export-body');
const layout = $('layout');
const sidebar = $('sidebar');
const splitter = $('splitter');
const tabStatCards = document.querySelectorAll('.tab-stat-card');
const statDownloaded = $('stat-downloaded');
const statAgeRestricted = $('stat-ageRestricted');
const statUnavailable = $('stat-unavailable');
const statCopyright = $('stat-copyright');
const statTerminated = $('stat-terminated');
const dashboardModal = $('dashboard-modal');
const dashboardModalTitle = $('dashboard-modal-title');
const dashboardModalSubtitle = $('dashboard-modal-subtitle');
const dashboardModalActions = $('dashboard-modal-actions');
const dashboardModalBody = $('dashboard-modal-body');
const dashboardModalClose = $('dashboard-modal-close');

// Sections affected by settings
const syncSection = $('sync-section');
const dividerSync = $('divider-sync');
const exportSection = $('export-section');
const dividerExport = $('divider-export');

// Mode elements
const modeBtns = document.querySelectorAll('.mode-btn');
const modePanels = {
  bookmarks: $('mode-bookmarks'),
  files: $('mode-files'),
  clipboard: $('mode-clipboard'),
};

// File mode elements
const fileDropZone = $('file-drop-zone');
const fileBrowseBtn = $('file-browse-btn');
const fileInput = $('file-input');
const fileLoadedInfo = $('file-loaded-info');
const fileNameDisplay = $('file-name-display');
const fileUrlCount = $('file-url-count');
const fileRemoveBtn = $('file-remove-btn');

// Clipboard mode elements
const clipboardToggle = $('clipboard-toggle');
const clipboardCount = $('clipboard-count');
const clipboardListWrap = $('clipboard-list-wrap');
const clipboardList = $('clipboard-list');

let selectedFormat = 'mp3';
let toastTimer;
let pathSaveTimer;
let isDownloading = false;
let currentMode = 'bookmarks';
let fileUrls = [];
let clipboardUrls = [];
let clipboardPollTimer = null;
let clipboardRenderFrame = 0;
let totalRefreshToken = 0;
let currentDashboardBucket = null;
let downloadDashboardState = {
  stats: {
    downloaded: 0,
    ageRestricted: 0,
    unavailable: 0,
    copyright: 0,
    terminated: 0,
  },
  issues: {
    ageRestricted: [],
    unavailable: [],
    copyright: [],
    terminated: [],
  },
};

const CLIPBOARD_ROW_HEIGHT = 34;
const CLIPBOARD_OVERSCAN = 8;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

async function applyInterfaceLanguage() {
  if (!window.ExtensionI18n) return;
  const lang = await window.ExtensionI18n.getSavedLanguage();
  await window.ExtensionI18n.applyPageTranslations(document, lang);
}

function sendRuntimeMessage(message) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(message, response => {
      const error = chrome.runtime?.lastError;
      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }
      resolve(response);
    });
  });
}

function updateTotalForCurrentMode() {
  if (currentMode === 'bookmarks') {
    refreshTotal(folderSel.value);
    return;
  }

  if (currentMode === 'files') {
    totalNum.textContent = fileUrls.length || '—';
    return;
  }

  if (currentMode === 'clipboard') {
    totalNum.textContent = clipboardUrls.length || '—';
    return;
  }

  totalNum.textContent = '—';
}

function normalizeDashboardState(raw = {}) {
  return {
    stats: {
      downloaded: Number(raw.stats?.downloaded) || 0,
      ageRestricted: Number(raw.stats?.ageRestricted) || 0,
      unavailable: Number(raw.stats?.unavailable) || 0,
      copyright: Number(raw.stats?.copyright) || 0,
      terminated: Number(raw.stats?.terminated) || 0,
    },
    issues: {
      ageRestricted: Array.isArray(raw.issues?.ageRestricted) ? raw.issues.ageRestricted : [],
      unavailable: Array.isArray(raw.issues?.unavailable) ? raw.issues.unavailable : [],
      copyright: Array.isArray(raw.issues?.copyright) ? raw.issues.copyright : [],
      terminated: Array.isArray(raw.issues?.terminated) ? raw.issues.terminated : [],
    },
  };
}

function renderDashboardStats() {
  const stats = downloadDashboardState.stats;
  statDownloaded.textContent = stats.downloaded;
  statAgeRestricted.textContent = downloadDashboardState.issues.ageRestricted.length;
  statUnavailable.textContent = downloadDashboardState.issues.unavailable.length;
  statCopyright.textContent = downloadDashboardState.issues.copyright.length;
  statTerminated.textContent = downloadDashboardState.issues.terminated.length;
}

// Theme helpers
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
let savedThemePref = 'system';

function applyTheme(t) {
  savedThemePref = t || 'system';
  if (t === 'system') {
    html.setAttribute('data-theme', systemDark.matches ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', t);
  }
  const isDark = html.getAttribute('data-theme') === 'dark';
  iconMoon.style.display = isDark ? '' : 'none';
  iconSun.style.display = isDark ? 'none' : '';
  btnTheme.title = `Theme: ${savedThemePref}`;
}

systemDark.addEventListener('change', () => {
  if (savedThemePref === 'system') {
    applyTheme('system');
  }
});

function applyDownloadButtonState(downloading) {
  isDownloading = !!downloading;
  btnDownload.textContent = downloading ? 'Cancel' : 'Download All';
  btnDownload.classList.toggle('cancel', downloading);
}

// ── THEME TOGGLE ─────────────────────────────────────────────────
btnTheme.addEventListener('click', async () => {
  // Cycle: dark → light → system → dark
  let nxt;
  if (savedThemePref === 'dark') nxt = 'light';
  else if (savedThemePref === 'light') nxt = 'system';
  else nxt = 'dark';
  applyTheme(nxt);
  await store.set({ theme: nxt });
});

// ── OPEN IN TAB ─────────────────────────────────────────────────
$('btn-tab').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('ui.html?mode=tab') });
  window.close();
});

// ── SETTINGS ────────────────────────────────────────────────────
$('btn-settings').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
});

// ── EXPORT TOGGLE ───────────────────────────────────────────────
exportToggle.addEventListener('click', () => {
  const open = exportBody.classList.toggle('open');
  exportToggle.classList.toggle('open', open);
});

document.querySelectorAll('[data-export]').forEach(btn => {
  btn.addEventListener('click', () => {
    const fmt = btn.dataset.export;
    const urls = getUrlsForCurrentMode();
    if (!urls.length) { toast('No URLs available'); return; }

    // For bookmark mode, use bookmark data; for others, use urls list
    if (currentMode === 'bookmarks') {
      const fid = folderSel.value;
      if (!fid) { toast('Select a folder first'); return; }
      chrome.bookmarks.getChildren(fid, items => {
        const bms = items.filter(b => b.url);
        exportData(bms, fmt);
      });
    } else {
      const bms = urls.map(u => ({ title: u, url: u }));
      exportData(bms, fmt);
    }
  });
});

function exportData(bms, fmt) {
  let content = '', mime = 'text/plain', ext = fmt;
  if (fmt === 'txt') content = bms.map(b => `${b.title || ''}\n${b.url}\n`).join('\n');
  if (fmt === 'csv') {
    mime = 'text/csv';
    content = 'title,url\n' + bms.map(b => `"${(b.title || '').replace(/"/g, '""')}","${b.url}"`).join('\n');
  }
  if (fmt === 'html') {
    mime = 'text/html';
    const now = Math.floor(Date.now() / 1000);
    const links = bms.map(b => `<DT><A HREF="${b.url}" ADD_DATE="${now}">${esc(b.title || '')}</A>`).join('\n');
    content = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${links}\n</DL><p>`;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `bookmarks.${ext}`; a.click();
  URL.revokeObjectURL(url);
  toast(`Exported as ${fmt.toUpperCase()}`);
}

function esc(s) {
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

// ── FORMAT TOGGLE ────────────────────────────────────────────────
document.querySelectorAll('.to[data-fmt]').forEach(b => {
  b.addEventListener('click', async () => {
    document.querySelectorAll('.to[data-fmt]').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    selectedFormat = b.dataset.fmt;
    await store.set({ format: selectedFormat });
  });
});

// ── BOOKMARK TREE ────────────────────────────────────────────────
function buildTree(nodes, prefix = '') {
  nodes.forEach(n => {
    if (!n.url) {
      const o = document.createElement('option');
      o.value = n.id;
      o.textContent = (prefix + (n.title || '')) || '(no name)';
      folderSel.appendChild(o);
      if (n.children) buildTree(n.children, prefix + '\u2003');
    }
  });
}

async function refreshTotal(folderId) {
  const requestId = ++totalRefreshToken;
  if (!folderId) {
    if (currentMode === 'bookmarks') totalNum.textContent = '—';
    return;
  }

  const res = await sendRuntimeMessage({ type: 'GET_TOTAL', folderId });
  if (requestId !== totalRefreshToken || currentMode !== 'bookmarks') return;
  totalNum.textContent = res?.total ?? '—';
}

folderSel.addEventListener('change', async () => {
  const fid = folderSel.value;
  await store.set({ lastFolder: fid });
  refreshTotal(fid);
});

// ── PATH INPUT ───────────────────────────────────────────────────
pathInput.addEventListener('change', async () => {
  const val = pathInput.value.trim();
  pathInput.classList.toggle('has-path', !!val);
  await store.set({ downloadPath: val });
});
pathInput.addEventListener('input', () => {
  clearTimeout(pathSaveTimer);
  pathSaveTimer = setTimeout(async () => {
    const val = pathInput.value.trim();
    pathInput.classList.toggle('has-path', !!val);
    await store.set({ downloadPath: val });
  }, 600);
});

pathBrowse.addEventListener('click', async () => {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const name = handle.name;
    const res = await sendRuntimeMessage({ type: 'RESOLVE_PATH', folderName: name });
    if (res?.path) {
      pathInput.value = res.path;
      pathInput.classList.add('has-path');
      await store.set({ downloadPath: res.path });
      toast('✓ ' + res.path);
    } else {
      if (!pathInput.value) {
        pathInput.value = name;
        pathInput.classList.add('has-path');
        await store.set({ downloadPath: name });
      }
      toast(`Folder "${name}" selected — edit the path above to set the full location`);
    }
  } catch {}
});

// ── SYNC ─────────────────────────────────────────────────────────
btnSync.addEventListener('click', async () => {
  const fid = folderSel.value;
  if (!fid) { toast('Select a folder first'); return; }
  btnSync.disabled = true;
  const orig = btnSync.innerHTML;
  btnSync.textContent = 'Working…';

  const res = await sendRuntimeMessage({ type: 'SYNC_FOLDER', folderId: fid });
  btnSync.disabled = false;
  btnSync.innerHTML = orig;
  if (!res || res.ok === false) { toast(res?.error || 'Error'); return; }
  sScanned.textContent = res.total ?? 0;
  sSynced.textContent = res.synced ?? 0;
  sSkipped.textContent = res.skipped ?? 0;
  refreshTotal(fid);
  toast(`Synced ${res.synced} · Cleaned ${res.cleaned ?? 0}`);
});

// ── MODE SWITCHER ────────────────────────────────────────────────
modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    setMode(mode);
  });
});

function setMode(mode, { persist = true } = {}) {
  currentMode = mode;
  modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  Object.entries(modePanels).forEach(([k, panel]) => {
    panel.classList.toggle('active', k === mode);
  });

  // Update total display based on mode
  updateTotalForCurrentMode();

  if (mode === 'clipboard') startClipboardPolling();

  if (mode !== 'clipboard') stopClipboardPolling();

  // Show/hide bookmark-specific sections
  const isBookmarks = mode === 'bookmarks';
  if (syncSection) {
    syncSection.style.display = isBookmarks ? '' : 'none';
    dividerSync.style.display = isBookmarks ? '' : 'none';
  }

  // Persist mode
  if (persist) {
    store.set({ downloadMode: mode });
  }
}

// ── FILE MODE ────────────────────────────────────────────────────
fileDropZone.addEventListener('dragover', e => {
  e.preventDefault();
  fileDropZone.classList.add('over');
});
fileDropZone.addEventListener('dragleave', () => {
  fileDropZone.classList.remove('over');
});
fileDropZone.addEventListener('drop', e => {
  e.preventDefault();
  fileDropZone.classList.remove('over');
  if (e.dataTransfer.files.length) loadUrlFile(e.dataTransfer.files[0]);
});
fileDropZone.addEventListener('click', () => fileInput.click());
fileBrowseBtn.addEventListener('click', e => {
  e.stopPropagation();
  fileInput.click();
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) loadUrlFile(fileInput.files[0]);
});
fileRemoveBtn.addEventListener('click', () => {
  fileUrls = [];
  fileDropZone.style.display = '';
  fileLoadedInfo.style.display = 'none';
  if (currentMode === 'files') totalNum.textContent = '—';
  toast('File removed');
});

function loadUrlFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    fileUrls = extractUrlsFromText(text);
    fileNameDisplay.textContent = file.name;
    fileUrlCount.textContent = `${fileUrls.length} URLs`;
    fileDropZone.style.display = 'none';
    fileLoadedInfo.style.display = 'flex';
    if (currentMode === 'files') totalNum.textContent = fileUrls.length || '—';
    toast(`Loaded ${fileUrls.length} URLs from ${file.name}`);
  };
  reader.readAsText(file);
}

function extractUrlsFromText(text) {
  const lines = text.split(/[\r\n]+/);
  const urls = [];
  const seen = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Try to find YouTube URLs
    const matches = trimmed.match(/https?:\/\/(?:www\.youtube\.com|music\.youtube\.com|youtu\.be)\/[^\s,;]+/gi);
    if (matches) {
      for (const m of matches) {
        const vid = extractVideoId(m);
        if (vid && !seen.has(vid)) {
          seen.add(vid);
          urls.push(`https://www.youtube.com/watch?v=${vid}`);
        }
      }
    }
  }
  return urls;
}

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0];
    return u.searchParams.get('v') || null;
  } catch { return null; }
}

// ── CLIPBOARD MODE ───────────────────────────────────────────────
clipboardToggle.addEventListener('click', () => {
  const isOpen = clipboardListWrap.style.display !== 'none';
  clipboardListWrap.style.display = isOpen ? 'none' : '';
  clipboardToggle.classList.toggle('open', !isOpen);
  if (!isOpen) renderClipboardList();
});

function renderClipboardList() {
  clipboardCount.textContent = `${clipboardUrls.length} URLs copied`;
  const viewportHeight = clipboardListWrap.clientHeight || 200;
  const visibleCount = Math.ceil(viewportHeight / CLIPBOARD_ROW_HEIGHT);
  const start = Math.max(0, Math.floor((clipboardListWrap.scrollTop || 0) / CLIPBOARD_ROW_HEIGHT) - CLIPBOARD_OVERSCAN);
  const end = Math.min(clipboardUrls.length, start + visibleCount + (CLIPBOARD_OVERSCAN * 2));
  const topSpacer = start * CLIPBOARD_ROW_HEIGHT;
  const bottomSpacer = Math.max(0, (clipboardUrls.length - end) * CLIPBOARD_ROW_HEIGHT);

  let markup = `<div class="clipboard-spacer" style="height:${topSpacer}px"></div>`;
  for (let i = start; i < end; i++) {
    const url = clipboardUrls[i];
    const item = document.createElement('div');
    item.className = 'clipboard-item';
    item.innerHTML = `
      <span class="clipboard-item-url">${esc(url)}</span>
      <button class="clipboard-item-remove" data-idx="${i}" title="Remove">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    markup += item.outerHTML;
  }
  markup += `<div class="clipboard-spacer" style="height:${bottomSpacer}px"></div>`;
  clipboardList.innerHTML = markup;
}

function scheduleClipboardRender() {
  if (clipboardRenderFrame) cancelAnimationFrame(clipboardRenderFrame);
  clipboardRenderFrame = requestAnimationFrame(() => {
    clipboardRenderFrame = 0;
    renderClipboardList();
  });
}

clipboardList.addEventListener('click', event => {
  const btn = event.target.closest('.clipboard-item-remove');
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  if (!Number.isInteger(idx)) return;
  clipboardUrls.splice(idx, 1);
  saveClipboardUrls();
  scheduleClipboardRender();
  updateTotalForCurrentMode();
});

clipboardListWrap.addEventListener('scroll', () => {
  if (currentMode === 'clipboard' && clipboardListWrap.style.display !== 'none') {
    scheduleClipboardRender();
  }
});

async function saveClipboardUrls() {
  await store.set({ clipboardUrls: JSON.stringify(clipboardUrls) });
}

async function loadClipboardUrls() {
  const saved = await store.get(['clipboardUrls']);
  if (saved.clipboardUrls) {
    try {
      const parsed = JSON.parse(saved.clipboardUrls);
      clipboardUrls = Array.isArray(parsed) ? parsed : [];
    } catch { clipboardUrls = []; }
  }
  scheduleClipboardRender();
  if (currentMode === 'clipboard') updateTotalForCurrentMode();
}

// ── CLIPBOARD AUTO-POLLING ───────────────────────────────────────
let lastClipboardHash = '';

function hashStr(s) { return s.length + '|' + s.slice(0, 60); }

async function pollClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    const h = hashStr(text);
    if (h === lastClipboardHash) return;
    lastClipboardHash = h;
    const urls = extractUrlsFromText(text);
    if (!urls.length) return;
    let added = 0;
    for (const url of urls) {
      if (!clipboardUrls.includes(url)) {
        clipboardUrls.push(url);
        added++;
      }
    }
    if (added > 0) {
      await saveClipboardUrls();
      scheduleClipboardRender();
      if (currentMode === 'clipboard') updateTotalForCurrentMode();
    }
  } catch {}
}

function startClipboardPolling() {
  if (clipboardPollTimer) return;
  clipboardPollTimer = setInterval(pollClipboard, 1500);
  pollClipboard(); // immediate first check
}

function stopClipboardPolling() {
  if (clipboardPollTimer) { clearInterval(clipboardPollTimer); clipboardPollTimer = null; }
}

// ── GET URLS FOR CURRENT MODE ────────────────────────────────────
function getUrlsForCurrentMode() {
  if (currentMode === 'files') return fileUrls;
  if (currentMode === 'clipboard') return clipboardUrls;
  return []; // bookmarks are handled separately
}

function removeClipboardUrl(url) {
  const before = clipboardUrls.length;
  clipboardUrls = clipboardUrls.filter(entry => entry !== url);
  if (clipboardUrls.length !== before) {
    saveClipboardUrls();
    scheduleClipboardRender();
    if (currentMode === 'clipboard') updateTotalForCurrentMode();
  }
}

function classifyIssueBucket(errText = '') {
  const text = String(errText).toLowerCase();
  if (text.includes('confirm your age') || text.includes('inappropriate for some users') || text.includes('sign in to confirm your age') || text.includes('age')) return 'ageRestricted';
  if (text.includes('copyright claim')) return 'copyright';
  if (text.includes('channel has been terminated') || text.includes('account has been terminated') || text.includes('terminated')) return 'terminated';
  if (text.includes('unavailable') || text.includes('not available')) return 'unavailable';
  return null;
}

async function loadDashboardState() {
  const res = await sendRuntimeMessage({ type: 'GET_DOWNLOAD_DASHBOARD_STATE' });
  if (!res || res.error) return;
  downloadDashboardState = normalizeDashboardState(res);
  renderDashboardStats();
  if (document.body.classList.contains('tab-mode') && !dashboardModal.hidden && currentDashboardBucket) {
    if (currentDashboardBucket === 'ageRestricted') openAgeRestrictedDialog();
    else openIssueDialog(currentDashboardBucket);
  }
}

function closeDashboardModal() {
  dashboardModal.hidden = true;
  dashboardModalActions.innerHTML = '';
  dashboardModalBody.innerHTML = '';
  currentDashboardBucket = null;
}

function openDashboardModal(title, subtitle) {
  if (!document.body.classList.contains('tab-mode')) return;
  dashboardModal.hidden = false;
  dashboardModalTitle.textContent = title;
  dashboardModalSubtitle.textContent = subtitle;
}

function getIssuesForBucket(bucket) {
  return downloadDashboardState.issues[bucket] || [];
}

async function persistIssueState(nextIssues) {
  downloadDashboardState.issues = nextIssues;
  await store.set({ downloadIssuesJson: JSON.stringify(nextIssues) });
  renderDashboardStats();
}

function renderIssueList(bucket) {
  const issues = getIssuesForBucket(bucket);
  if (!issues.length) {
    dashboardModalBody.innerHTML = '<div class="modal-copy">No items in this category right now.</div>';
    return;
  }

  dashboardModalBody.innerHTML = `
    <div class="issue-list">
      ${issues.map((issue, index) => `
        <div class="issue-item" data-issue-index="${index}">
          <div class="issue-item-main">
            <div class="issue-title">${esc(issue.title || 'Unknown title')}</div>
            <div class="issue-url">${esc(issue.url || 'No URL stored')}</div>
            <div class="issue-replace-row">
              <input class="issue-replace-input" data-replace-input="${index}" placeholder="Paste replacement YouTube URL" value="${esc(issue.url || '')}" />
              <button class="mini-btn" data-replace-download="${index}">Use URL</button>
            </div>
          </div>
          <div class="issue-actions">
            <button class="mini-btn" data-open-search="${index}">Open search</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function buildIssueRetryQueue(bucket, outputPath, format, cookieMode) {
  return getIssuesForBucket(bucket).map((issue, index) => ({
    url: `ytsearch1:${issue.title}`,
    sourceUrl: issue.url,
    videoId: `${bucket}-${Date.now()}-${index}`,
    title: issue.title,
    format,
    outputPath,
    cookieMode,
    sourceMode: 'issue-retry',
    issueBucket: bucket,
  }));
}

async function startIssueRetry(bucket) {
  const outputPath = pathInput.value.trim();
  if (!outputPath) {
    toast('Set the output folder path first');
    return;
  }
  const saved = await store.get(['downloadCookieMode']);
  const queue = buildIssueRetryQueue(bucket, outputPath, selectedFormat, saved.downloadCookieMode || 'off');
  if (!queue.length) {
    toast('Nothing to retry');
    return;
  }
  const res = await sendRuntimeMessage({ type: 'START_DOWNLOAD_QUEUE', queue });
  if (res?.ok === false) {
    toast(res.error || 'Could not start retry');
    return;
  }
  applyDownloadButtonState(true);
  closeDashboardModal();
  toast(`Retrying ${queue.length} item${queue.length === 1 ? '' : 's'}`);
}

function openAgeRestrictedDialog() {
  currentDashboardBucket = 'ageRestricted';
  openDashboardModal('Age restricted', 'Use browser cookies for restricted videos.');
  dashboardModalActions.innerHTML = `
    <div class="cookie-choice-grid">
      <button class="mini-btn" data-cookie-choice="browser">Use current browser cookies</button>
      <button class="mini-btn" data-cookie-choice="signin">Sign in with Google / YouTube</button>
      <button class="mini-btn" data-cookie-choice="off">Disable cookies</button>
    </div>
  `;
  dashboardModalBody.innerHTML = `
    <div class="modal-copy">
      <p>This extension can realistically reuse the signed-in Chrome profile via <strong>yt-dlp --cookies-from-browser chrome</strong>.</p>
      <p><strong>Sign in</strong> opens YouTube/Google in a browser tab. <strong>Use current browser cookies</strong> enables cookie-based downloads immediately.</p>
    </div>
  `;
}

function openIssueDialog(bucket) {
  const labels = {
    unavailable: 'Unavailable',
    copyright: 'Copyright claim',
    terminated: 'Channel terminated',
  };
  currentDashboardBucket = bucket;
  openDashboardModal(labels[bucket], 'Retry with yt-dlp search or replace URLs manually.');
  dashboardModalActions.innerHTML = `<button class="mini-btn" data-retry-bucket="${bucket}">Retry all</button>`;
  renderIssueList(bucket);
}

async function openDownloadedFolder() {
  const saved = await store.get(['downloadPath']);
  if (!saved.downloadPath) {
    toast('Set the output folder first');
    return;
  }
  const res = await sendRuntimeMessage({ type: 'OPEN_DOWNLOAD_FOLDER', folderPath: saved.downloadPath });
  if (res?.ok === false) {
    toast(res.error || 'Could not open folder');
    return;
  }
  toast('Opened download folder');
}

tabStatCards.forEach(card => {
  card.addEventListener('click', () => {
    const action = card.dataset.statAction;
    if (action === 'downloaded') {
      openDownloadedFolder();
      return;
    }
    if (action === 'ageRestricted') {
      openAgeRestrictedDialog();
      return;
    }
    if (action === 'unavailable' || action === 'copyright' || action === 'terminated') {
      openIssueDialog(action);
    }
  });
});

dashboardModalClose.addEventListener('click', closeDashboardModal);
dashboardModal.addEventListener('click', event => {
  if (event.target === dashboardModal) closeDashboardModal();
});

window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !dashboardModal.hidden) {
    closeDashboardModal();
  }
});

dashboardModalActions.addEventListener('click', async event => {
  const retryBucket = event.target.closest('[data-retry-bucket]')?.dataset.retryBucket;
  if (retryBucket) {
    startIssueRetry(retryBucket);
    return;
  }

  const cookieChoice = event.target.closest('[data-cookie-choice]')?.dataset.cookieChoice;
  if (!cookieChoice) return;

  if (cookieChoice === 'signin') {
    await store.set({ downloadCookieMode: 'browser' });
    chrome.tabs.create({ url: 'https://accounts.google.com/ServiceLogin?service=youtube' });
    toast('Sign in in the opened tab, then retry the download.');
    closeDashboardModal();
    return;
  }

  await store.set({ downloadCookieMode: cookieChoice === 'browser' ? 'browser' : 'off' });
  toast(cookieChoice === 'browser' ? 'Browser cookies enabled for downloads' : 'Cookie usage disabled');
  closeDashboardModal();
});

dashboardModalBody.addEventListener('click', async event => {
  const searchIndex = event.target.closest('[data-open-search]')?.dataset.openSearch;
  if (searchIndex != null && currentDashboardBucket) {
    const issue = getIssuesForBucket(currentDashboardBucket)[Number(searchIndex)];
    if (!issue) return;
    chrome.tabs.create({ url: `https://www.youtube.com/results?search_query=${encodeURIComponent(issue.title || issue.url || '')}` });
    return;
  }

  const replaceIndex = event.target.closest('[data-replace-download]')?.dataset.replaceDownload;
  if (replaceIndex == null || !currentDashboardBucket) return;

  const issue = getIssuesForBucket(currentDashboardBucket)[Number(replaceIndex)];
  const input = dashboardModalBody.querySelector(`[data-replace-input="${replaceIndex}"]`);
  const replacementUrl = input?.value?.trim() || '';
  const videoId = extractVideoId(replacementUrl);
  if (!videoId) {
    toast('Paste a valid YouTube URL');
    return;
  }

  const outputPath = pathInput.value.trim();
  if (!outputPath) {
    toast('Set the output folder path first');
    return;
  }

  const saved = await store.get(['downloadCookieMode']);
  const nextIssues = { ...downloadDashboardState.issues };
  nextIssues[currentDashboardBucket] = nextIssues[currentDashboardBucket].map((entry, index) => index === Number(replaceIndex) ? { ...entry, url: replacementUrl, videoId } : entry);
  await persistIssueState(nextIssues);

  const queue = [{
    url: `https://www.youtube.com/watch?v=${videoId}`,
    sourceUrl: replacementUrl,
    videoId,
    title: issue?.title || videoId,
    format: selectedFormat,
    outputPath,
    cookieMode: saved.downloadCookieMode || 'off',
    sourceMode: 'issue-manual-replace',
    issueBucket: currentDashboardBucket,
  }];
  const res = await sendRuntimeMessage({ type: 'START_DOWNLOAD_QUEUE', queue });
  if (res?.ok === false) {
    toast(res.error || 'Could not start replacement download');
    return;
  }

  closeDashboardModal();
  applyDownloadButtonState(true);
  toast('Replacement download started');
});

// ── DOWNLOAD ─────────────────────────────────────────────────────
btnDownload.addEventListener('click', async () => {
  if (isDownloading) {
    await sendRuntimeMessage({ type: 'CANCEL_DOWNLOAD_QUEUE' });
    toast('Download cancelled');
    applyDownloadButtonState(false);
    return;
  }

  const outputPath = pathInput.value.trim();
  if (!outputPath) {
    toast('Set the output folder path first');
    pathInput.focus();
    return;
  }

  const saved = await store.get(['downloadCookieMode']);
  const cookieMode = saved.downloadCookieMode || 'off';

  if (currentMode === 'bookmarks') {
    const fid = folderSel.value;
    if (!fid) { toast('Select a bookmark folder first'); return; }

    chrome.bookmarks.getChildren(fid, async items => {
      const bms = items.filter(b => b.url);
      if (!bms.length) { toast('No bookmarks found'); return; }

      const queue = [];
      const seen = new Set();

      bms.forEach(b => {
        try {
          const u = new URL(b.url);
          const vid = u.searchParams.get('v');
          if (!vid || seen.has(vid)) return;
          seen.add(vid);
          queue.push({
            url: `https://www.youtube.com/watch?v=${vid}`,
            sourceUrl: b.url,
            videoId: vid,
            title: b.title,
            format: selectedFormat,
            outputPath,
            cookieMode,
            sourceMode: 'bookmarks',
          });
        } catch {}
      });

      startDownloadQueue(queue);
    });
  } else {
    // Files or Clipboard mode
    const urls = getUrlsForCurrentMode();
    if (!urls.length) { toast('No URLs to download'); return; }

    const queue = [];
    const seen = new Set();

    urls.forEach(url => {
      const vid = extractVideoId(url);
      if (!vid || seen.has(vid)) return;
      seen.add(vid);
      queue.push({
        url: `https://www.youtube.com/watch?v=${vid}`,
        sourceUrl: url,
        videoId: vid,
        title: vid,
        format: selectedFormat,
        outputPath,
        cookieMode,
        sourceMode: currentMode,
      });
    });

    startDownloadQueue(queue);
  }
});

async function startDownloadQueue(queue) {
  if (!queue.length) { toast('No valid URLs found'); return; }

  const res = await sendRuntimeMessage({ type: 'START_DOWNLOAD_QUEUE', queue });
  if (res?.ok === false) {
    toast(res.error || 'Could not start download');
    return;
  }
  applyDownloadButtonState(true);
  toast('Download started in background');

  dlLog.innerHTML = '';
  dlTotal.textContent = queue.length;
  dlCurrent.textContent = '0';
  dlFilename.textContent = 'Starting…';
}

// ── MESSAGE LISTENER ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'QUEUE_UPDATE') {
    applyDownloadButtonState(true);
    dlCurrent.textContent = msg.current;
    dlTotal.textContent = msg.total;
    dlFilename.textContent = msg.title;
    dlBar.style.width = '0%';
    dlPct.textContent = '—';
    dlSize.textContent = '—';
    dlEta.textContent = '—';
  }

  if (msg.type === 'DOWNLOAD_PROGRESS') {
    const pct = Math.round(msg.percent || 0);
    dlBar.style.width = pct + '%';
    dlPct.textContent = pct + '%';
    if (msg.size) dlSize.textContent = msg.size;
    if (msg.eta) dlEta.textContent = msg.eta;
  }

  if (msg.type === 'QUEUE_RESULT') {
    const line = msg.result.skipped
      ? `⟳ ${msg.title}`
      : msg.result.success
        ? `✓ ${msg.title}${msg.result.warning ? ` (${msg.result.warning})` : ''}`
        : `✗ ${msg.title}: ${msg.result.error || ''}`;
    appendLog(line, msg.result.skipped ? 'skip' : msg.result.success ? 'ok' : 'err');

    if ((msg.result.success || msg.result.skipped) && msg.item?.sourceMode === 'clipboard' && msg.item?.sourceUrl) {
      removeClipboardUrl(msg.item.sourceUrl);
    }

    if (msg.result.success || msg.result.skipped || classifyIssueBucket(msg.result.error)) {
      loadDashboardState();
    }
  }

  if (msg.type === 'QUEUE_DONE') {
    dlFilename.textContent = msg.cancelled ? 'Cancelled' : 'Done';
    dlBar.style.width = msg.cancelled ? '0%' : '100%';
    dlPct.textContent = msg.cancelled ? '—' : '100%';
    applyDownloadButtonState(false);
    toast(msg.cancelled ? 'Download cancelled' : 'All downloads finished');
    loadDashboardState();
  }
});

function appendLog(msg, cls = '') {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = msg;
  dlLog.appendChild(d);
  dlLog.scrollTop = dlLog.scrollHeight;
}

// ── RESIZABLE SIDEBAR ────────────────────────────────────────────
function initResizableSidebar() {
  if (!splitter) return;
  let active = false;
  const COMPACT_BREAKPOINT = 980;
  const MIN_SIDEBAR_WIDTH = 360;
  const MAX_SIDEBAR_WIDTH = 560;
  const MIN_TERMINAL_WIDTH = 420;

  function getSafeSidebarMaxWidth() {
    const splitterWidth = splitter.getBoundingClientRect().width || 6;
    const available = layout.clientWidth - splitterWidth - MIN_TERMINAL_WIDTH;
    return Math.min(MAX_SIDEBAR_WIDTH, available);
  }

  function clampSidebarWidth(px) {
    const maxWidth = getSafeSidebarMaxWidth();
    if (maxWidth < MIN_SIDEBAR_WIDTH) {
      sidebar.style.width = '';
      return;
    }
    const safeWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxWidth, px));
    sidebar.style.width = `${safeWidth}px`;
  }

  function resetSidebarWidthForCompactLayout() {
    if (window.innerWidth < COMPACT_BREAKPOINT) {
      sidebar.style.width = '';
      return;
    }

    if (sidebar.style.width) {
      const raw = parseFloat(sidebar.style.width);
      if (!Number.isNaN(raw)) clampSidebarWidth(raw);
    }
  }

  resetSidebarWidthForCompactLayout();
  window.addEventListener('resize', resetSidebarWidthForCompactLayout);

  splitter.addEventListener('mousedown', () => { active = true; });
  window.addEventListener('mouseup', () => { active = false; });
  window.addEventListener('mousemove', e => {
    if (!active || window.innerWidth < COMPACT_BREAKPOINT) return;
    const appLeft = layout.getBoundingClientRect().left;
    clampSidebarWidth(e.clientX - appLeft);
  });
}

// ── APPLY SETTINGS ───────────────────────────────────────────────
async function applySettings() {
  const saved = await store.get(['autoSync', 'showExport', 'defaultFolder', 'lastFolder']);

  // Auto sync — hide manual sync button if enabled
  const isBookmarks = currentMode === 'bookmarks';
  if (saved.autoSync) {
    syncSection.style.display = 'none';
    dividerSync.style.display = 'none';
  } else {
    syncSection.style.display = isBookmarks ? '' : 'none';
    dividerSync.style.display = isBookmarks ? '' : 'none';
  }

  // Show/hide export section — hidden by default (showExport must be explicitly true)
  if (saved.showExport === true) {
    exportSection.style.display = '';
    dividerExport.style.display = '';
  } else {
    exportSection.style.display = 'none';
    dividerExport.style.display = 'none';
  }

  // Default folder
  if (saved.defaultFolder && !saved.lastFolder) {
    folderSel.value = saved.defaultFolder;
    if (folderSel.value) {
      await store.set({ lastFolder: saved.defaultFolder });
    }
  }
}

// ── INIT ─────────────────────────────────────────────────────────
async function init() {
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || 'popup';
  document.body.classList.toggle('tab-mode', mode === 'tab');
  document.body.classList.toggle('popup-mode', mode !== 'tab' && mode !== 'sidebar');

  const saved = await store.get(['theme', 'format', 'downloadPath', 'lastFolder', 'defaultFolder', 'downloadMode']);
  await applyInterfaceLanguage();
  applyTheme(saved.theme || 'system');

  if (saved.format) {
    selectedFormat = saved.format === 'm4a' ? 'fast' : saved.format;
  } else {
    selectedFormat = 'mp3';
  }
  document.querySelectorAll('.to[data-fmt]').forEach(b => b.classList.toggle('on', b.dataset.fmt === selectedFormat));

  if (saved.downloadPath) {
    pathInput.value = saved.downloadPath;
    pathInput.classList.add('has-path');
  }

  await new Promise(r => chrome.bookmarks.getTree(tree => {
    folderSel.innerHTML = '';
    buildTree(tree);
    r();
  }));

  // Use default folder if set, otherwise use last folder
  const folderToUse = saved.lastFolder || saved.defaultFolder || '';
  if (folderToUse) {
    folderSel.value = folderToUse;
    if (!folderSel.value) folderSel.selectedIndex = 0;
  }

  loadClipboardUrls();

  // Restore last-used mode
  const modeToUse = saved.downloadMode || 'bookmarks';
  setMode(modeToUse, { persist: false });
  // Start clipboard polling if mode is clipboard
  if (modeToUse === 'clipboard') startClipboardPolling();
  updateTotalForCurrentMode();

  const qState = await sendRuntimeMessage({ type: 'GET_QUEUE_STATE' }) || {};

  if (qState.isDownloading) {
    applyDownloadButtonState(true);
    dlCurrent.textContent = qState.current || 0;
    dlTotal.textContent = qState.total || 0;
    dlFilename.textContent = qState.title || 'Downloading…';
  }

  // Apply settings-driven visibility
  await applySettings();
  await loadDashboardState();

  if (mode === 'tab') initResizableSidebar();

  // Real-time sync from settings page
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.theme) applyTheme(changes.theme.newValue);
    if (changes.showExport || changes.autoSync) applySettings();
    if (changes.format) {
      selectedFormat = changes.format.newValue === 'm4a' ? 'fast' : (changes.format.newValue || 'mp3');
      document.querySelectorAll('.to[data-fmt]').forEach(b => b.classList.toggle('on', b.dataset.fmt === selectedFormat));
    }
    if (changes.downloadPath && document.activeElement !== pathInput) {
      pathInput.value = changes.downloadPath.newValue || '';
      pathInput.classList.toggle('has-path', !!pathInput.value.trim());
    }
    if (changes.downloadMode && changes.downloadMode.newValue && changes.downloadMode.newValue !== currentMode) {
      setMode(changes.downloadMode.newValue, { persist: false });
    }
    if (changes.interfaceLanguage) applyInterfaceLanguage();
    if (changes.clipboardUrls) {
      try {
        const parsed = JSON.parse(changes.clipboardUrls.newValue || '[]');
        clipboardUrls = Array.isArray(parsed) ? parsed : [];
      } catch {
        clipboardUrls = [];
      }
      scheduleClipboardRender();
      if (currentMode === 'clipboard') {
        updateTotalForCurrentMode();
      }
    }
    if (changes.downloadStatsJson || changes.downloadIssuesJson) loadDashboardState();
    if (changes.defaultFolder && !folderSel.value) {
      folderSel.value = changes.defaultFolder.newValue || '';
      if (currentMode === 'bookmarks') refreshTotal(folderSel.value);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
