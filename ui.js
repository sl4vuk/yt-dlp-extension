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
const statDownloadedLabel = document.querySelector('.tab-stat-card[data-stat-action="downloaded"] .tab-stat-label');
const statAgeRestricted = $('stat-ageRestricted');
const statUnavailable = $('stat-unavailable');
const statCopyright = $('stat-copyright');
const statTerminated = $('stat-terminated');
const terminalFilterActions = $('terminal-filter-actions');
const terminalRetryAll = $('terminal-retry-all');
const terminalLogin = $('terminal-login');
const terminalFilterLabel = $('terminal-filter-label');
const terminalFilterList = $('terminal-filter-list');

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
let outputMode = 'audio'; // 'audio' or 'video'
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
  downloadedItems: [],
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
    downloadedItems: Array.isArray(raw.downloadedItems) ? raw.downloadedItems : [],
    issues: {
      ageRestricted: Array.isArray(raw.issues?.ageRestricted) ? raw.issues.ageRestricted : [],
      unavailable: Array.isArray(raw.issues?.unavailable) ? raw.issues.unavailable : [],
      copyright: Array.isArray(raw.issues?.copyright) ? raw.issues.copyright : [],
      terminated: Array.isArray(raw.issues?.terminated) ? raw.issues.terminated : [],
    },
  };
}

function getFailedItems() {
  return [
    ...downloadDashboardState.issues.unavailable,
    ...downloadDashboardState.issues.ageRestricted,
    ...downloadDashboardState.issues.copyright,
    ...downloadDashboardState.issues.terminated,
  ];
}

function renderDashboardStats() {
  const stats = downloadDashboardState.stats;
  const downloadedMode = currentDashboardBucket === 'failed' ? 'failed' : 'downloaded';
  statDownloaded.textContent = downloadedMode === 'failed' ? getFailedItems().length : stats.downloaded;
  if (statDownloadedLabel) statDownloadedLabel.textContent = downloadedMode === 'failed' ? 'Failed' : 'Downloaded';
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

// ── OUTPUT MODE (Audio / Video toggle) ──────────────────────────
const AUDIO_FORMATS = ['mp3','ogg','wav','m4a'];
const VIDEO_FORMATS = ['mp4','webm','flv'];

const fmtSubmenu = $('fmt-submenu');
const fmtMainBtns = $('fmt-main-btns');
let fmtSubmenuOpen = false;

function closeFmtSubmenu() {
  if (!fmtSubmenuOpen) return;
  fmtSubmenuOpen = false;
  fmtSubmenu?.classList.remove('is-open');
  $('btn-fmt-mp3')?.closest('.fmt-compact-wrap')?.classList.remove('fmt-submenu-open');
}

function openFmtSubmenu() {
  fmtSubmenuOpen = true;
  buildFmtSubmenu();
  fmtSubmenu?.classList.add('is-open');
  $('btn-fmt-mp3')?.closest('.fmt-compact-wrap')?.classList.add('fmt-submenu-open');
  fmtSubmenu?.querySelectorAll('.fmt-sub-opt').forEach(b => {
    b.classList.toggle('active', b.dataset.fmt === selectedFormat);
  });
}

function buildFmtSubmenu() {
  if (!fmtSubmenu) return;
  const formats = outputMode === 'audio' ? AUDIO_FORMATS : VIDEO_FORMATS;
  fmtSubmenu.innerHTML = formats.map(f =>
    `<button class="fmt-sub-opt${selectedFormat === f ? ' active' : ''}" data-fmt="${f}">${f.toUpperCase()}</button>`
  ).join('');
}

function syncFmtMainButtons() {
  // Fast button always shown. MP3 button shows current non-fast selection label
  const mp3Btn = $('btn-fmt-mp3');
  if (!mp3Btn) return;
  const isAudio = outputMode === 'audio';
  const nonFastFmts = isAudio ? AUDIO_FORMATS : VIDEO_FORMATS;
  const isFast = selectedFormat === 'fast';
  const activeNonFast = nonFastFmts.includes(selectedFormat) ? selectedFormat : (isAudio ? 'mp3' : 'mp4');
  mp3Btn.childNodes[0].textContent = activeNonFast.toUpperCase() + ' ';
  fmtMainBtns?.querySelectorAll('.to').forEach(b => {
    b.classList.toggle('on', b.dataset.fmt === (isFast ? 'fast' : '_non-fast'));
  });
  if (isFast) {
    fmtMainBtns?.querySelector('[data-fmt="fast"]')?.classList.add('on');
    mp3Btn?.classList.remove('on');
  } else {
    fmtMainBtns?.querySelector('[data-fmt="fast"]')?.classList.remove('on');
    mp3Btn?.classList.add('on');
  }
}

// Fast button
fmtMainBtns?.querySelector('[data-fmt="fast"]')?.addEventListener('click', async () => {
  closeFmtSubmenu();
  selectedFormat = 'fast';
  syncFmtMainButtons();
  await store.set({ format: 'fast' });
});

// MP3/non-fast button — toggle submenu
$('btn-fmt-mp3')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (fmtSubmenuOpen) { closeFmtSubmenu(); return; }
  buildFmtSubmenu();
  openFmtSubmenu();
});

// Submenu item click
fmtSubmenu?.addEventListener('click', async (e) => {
  const btn = e.target.closest('.fmt-sub-opt');
  if (!btn) return;
  selectedFormat = btn.dataset.fmt;
  closeFmtSubmenu();
  syncFmtMainButtons();
  await store.set({ format: selectedFormat });
});

// Close submenu on outside click
document.addEventListener('click', () => closeFmtSubmenu());

function applyOutputMode(mode, { persist = true } = {}) {
  outputMode = mode || 'audio';
  const isAudio = outputMode === 'audio';
  const btnMode = $('btn-output-mode');
  const iconAudio = $('icon-output-audio');
  const iconVideo = $('icon-output-video');
  if (btnMode) {
    btnMode.title = isAudio ? 'Audio mode — click to switch to Video' : 'Video mode — click to switch to Audio';
  }
  if (iconAudio) iconAudio.style.display = isAudio ? '' : 'none';
  if (iconVideo) iconVideo.style.display = isAudio ? 'none' : '';

  // If current format doesn't belong to new mode, reset
  const validFmts = isAudio ? ['fast', ...AUDIO_FORMATS] : ['fast', ...VIDEO_FORMATS];
  if (!validFmts.includes(selectedFormat)) {
    selectedFormat = isAudio ? 'mp3' : 'mp4';
  }
  syncFmtMainButtons();
  if (persist) store.set({ outputMode });
}

$('btn-output-mode')?.addEventListener('click', () => {
  applyOutputMode(outputMode === 'audio' ? 'video' : 'audio');
});

// ── TERMINAL CLEAR DROPDOWN ──────────────────────────────────────
const terminalClearTrigger = $('terminal-clear-trigger');
const terminalClearMenu = $('terminal-clear-menu');
let clearMenuOpen = false;

terminalClearTrigger?.addEventListener('click', e => {
  e.stopPropagation();
  clearMenuOpen = !clearMenuOpen;
  terminalClearMenu?.classList.toggle('is-open', clearMenuOpen);
});
document.addEventListener('click', () => {
  clearMenuOpen = false;
  terminalClearMenu?.classList.remove('is-open');
});

$('clear-completed')?.addEventListener('click', () => {
  // Remove only 'ok' log lines and zero the downloaded stat
  const lines = dlLog.querySelectorAll('.ok');
  lines.forEach(l => l.remove());
  // Reset downloaded counter in state
  downloadDashboardState.stats.downloaded = 0;
  downloadDashboardState.downloadedItems = [];
  store.set({ downloadedItemsJson: '[]', downloadStatsJson: JSON.stringify(downloadDashboardState.stats) });
  renderDashboardStats();
  toast('Completed items cleared');
});

$('clear-all')?.addEventListener('click', () => {
  dlLog.innerHTML = '';
  downloadDashboardState = normalizeDashboardState({});
  store.set({ downloadStatsJson: '{}', downloadIssuesJson: '{}', downloadedItemsJson: '[]' });
  renderDashboardStats();
  clearTerminalFilter();
  toast('All cleared');
});

// ── CLIPBOARD: Ctrl+V PASTE & DRAG-DROP ─────────────────────────
function isValidYtUrl(url) {
  try {
    const u = new URL(url.trim());
    return (u.hostname === 'www.youtube.com' || u.hostname === 'music.youtube.com' || u.hostname === 'youtu.be') &&
      (u.pathname === '/watch' || u.hostname === 'youtu.be');
  } catch { return false; }
}

function addClipboardUrl(raw) {
  const urls = extractUrlsFromText(raw);
  let added = 0;
  for (const url of urls) {
    if (!clipboardUrls.includes(url)) { clipboardUrls.push(url); added++; }
  }
  if (added) {
    saveClipboardUrls();
    scheduleClipboardRender();
    updateTotalForCurrentMode();
    toast(`Added ${added} URL${added > 1 ? 's' : ''}`);
  }
  return added;
}

document.addEventListener('keydown', async e => {
  if (currentMode !== 'clipboard') return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    try {
      const text = await navigator.clipboard.readText();
      if (!addClipboardUrl(text)) toast('No valid YouTube URL found');
    } catch { toast('Clipboard access denied'); }
  }
});

// Drag URL text onto sidebar in clipboard mode
const sidebarEl = $('sidebar');
sidebarEl?.addEventListener('dragover', e => {
  if (currentMode !== 'clipboard') return;
  e.preventDefault();
  sidebarEl.classList.add('clipboard-drop-active');
});
sidebarEl?.addEventListener('dragleave', () => sidebarEl.classList.remove('clipboard-drop-active'));
sidebarEl?.addEventListener('drop', e => {
  sidebarEl.classList.remove('clipboard-drop-active');
  if (currentMode !== 'clipboard') return;
  e.preventDefault();
  const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list') || '';
  if (!addClipboardUrl(text)) toast('No valid YouTube URL found');
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
  if (currentDashboardBucket) renderTerminalFilter(currentDashboardBucket);
}

function clearTerminalFilter() {
  currentDashboardBucket = null;
  terminalFilterActions.hidden = true;
  terminalFilterLabel.hidden = true;
  terminalFilterList.hidden = true;
  terminalFilterLabel.textContent = '';
  terminalFilterList.innerHTML = '';
  tabStatCards.forEach(card => card.classList.remove('active'));
  renderDashboardStats();
}

function getFilterTitle(bucket) {
  const map = {
    downloaded: 'Downloaded',
    failed: 'Failed',
    unavailable: 'Unavailable',
    ageRestricted: 'Age restricted',
    copyright: 'Copyright claim',
    terminated: 'Channel terminated',
  };
  return map[bucket] || bucket;
}

function getIssuesForBucket(bucket) {
  if (bucket === 'downloaded') return downloadDashboardState.downloadedItems || [];
  if (bucket === 'failed') return getFailedItems();
  return downloadDashboardState.issues[bucket] || [];
}

async function persistIssueState(nextIssues) {
  downloadDashboardState.issues = nextIssues;
  await store.set({ downloadIssuesJson: JSON.stringify(nextIssues) });
  renderDashboardStats();
  if (currentDashboardBucket) renderTerminalFilter(currentDashboardBucket);
}

function renderTerminalFilter(bucket) {
  currentDashboardBucket = bucket;
  const issues = getIssuesForBucket(bucket);
  tabStatCards.forEach(card => {
    const action = card.dataset.statAction;
    card.classList.toggle('active', (bucket === 'failed' && action === 'downloaded') || action === bucket);
  });
  const isFailureFilter = bucket !== 'downloaded' && issues.length > 0;
  terminalFilterActions.hidden = !isFailureFilter;
  terminalFilterLabel.hidden = false;
  terminalFilterList.hidden = false;
  terminalLogin.hidden = bucket !== 'ageRestricted';
  terminalRetryAll.hidden = bucket === 'downloaded';
  terminalFilterLabel.textContent = `${getFilterTitle(bucket)} · ${issues.length}`;
  renderDashboardStats();

  if (!issues.length) {
    terminalFilterList.innerHTML = '<div class="terminal-filter-item"><div class="terminal-filter-url">No items in this category right now.</div></div>';
    return;
  }

  terminalFilterList.innerHTML = issues.map((issue, index) => `
    <div class="terminal-filter-item" data-issue-index="${index}">
      <button class="terminal-filter-title" data-open-search="${index}">${esc(issue.title || 'Unknown title')}</button>
      <div class="terminal-filter-url">${esc(issue.url || 'No URL stored')}</div>
      <div class="terminal-filter-row">
        <input class="terminal-filter-input" data-replace-input="${index}" value="${esc(issue.url || '')}" placeholder="Paste replacement YouTube URL" />
        <button class="terminal-inline-btn" data-replace-download="${index}">Use URL</button>
      </div>
    </div>
  `).join('');
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
  const saved = await store.get(['downloadCookieMode', 'oauthCookiesText']);
  const queue = buildIssueRetryQueue(bucket, outputPath, selectedFormat, saved.downloadCookieMode || 'off').map(item => ({
    ...item,
    cookieText: saved.oauthCookiesText || '',
  }));
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
  renderTerminalFilter(bucket);
  toast(`Retrying ${queue.length} item${queue.length === 1 ? '' : 's'}`);
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
      if (currentDashboardBucket === 'downloaded') {
        renderTerminalFilter('failed');
      } else if (currentDashboardBucket === 'failed') {
        clearTerminalFilter();
      } else {
        renderTerminalFilter('downloaded');
      }
      return;
    }
    if (currentDashboardBucket === action) {
      clearTerminalFilter();
      return;
    }
    renderTerminalFilter(action);
  });
});

terminalRetryAll.addEventListener('click', async () => {
  if (!currentDashboardBucket) return;
  startIssueRetry(currentDashboardBucket);
});

terminalLogin.addEventListener('click', async () => {
  await store.set({ downloadCookieMode: 'browser' });
  chrome.tabs.create({ url: chrome.runtime.getURL('settings.html#oauth-card') });
});

terminalFilterList.addEventListener('click', async event => {
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
  const input = terminalFilterList.querySelector(`[data-replace-input="${replaceIndex}"]`);
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

  const saved = await store.get(['downloadCookieMode', 'oauthCookiesText']);
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
    cookieText: saved.oauthCookiesText || '',
    sourceMode: 'issue-manual-replace',
    issueBucket: currentDashboardBucket,
  }];
  const res = await sendRuntimeMessage({ type: 'START_DOWNLOAD_QUEUE', queue });
  if (res?.ok === false) {
    toast(res.error || 'Could not start replacement download');
    return;
  }

  renderTerminalFilter(currentDashboardBucket);
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

  const saved = await store.get(['downloadCookieMode', 'oauthCookiesText', 'startDownloadAutomatically']);
  const cookieMode = saved.downloadCookieMode || 'off';
  const cookieText = saved.oauthCookiesText || '';

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
            cookieText,
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
        cookieText,
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
    const cls = msg.result.skipped ? 'skip' : msg.result.success ? 'ok' : 'err';
    appendLog(line, cls);

    if ((msg.result.success || msg.result.skipped) && msg.item?.sourceMode === 'clipboard' && msg.item?.sourceUrl) {
      removeClipboardUrl(msg.item.sourceUrl);
    }

    if (msg.result.success || msg.result.skipped || classifyIssueBucket(msg.result.error)) {
      loadDashboardState();
    }

    // Auto-remove completed log line if setting is on
    store.get(['removeCompletedAutomatically']).then(s => {
      if (s.removeCompletedAutomatically && (msg.result.success || msg.result.skipped)) {
        const last = dlLog.querySelector(`.${cls}:last-child`);
        if (last) setTimeout(() => last.remove(), 1200);
      }
    });
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
  document.body.classList.toggle('sidebar-mode', mode === 'sidebar');

  const saved = await store.get(['theme', 'format', 'downloadPath', 'lastFolder', 'defaultFolder', 'downloadMode', 'outputMode']);
  await applyInterfaceLanguage();
  applyTheme(saved.theme || 'system');

  // Restore output mode (audio/video) — must happen before format restore
  outputMode = saved.outputMode || 'audio';
  const isAudio = outputMode === 'audio';
  const allValidFmts = isAudio ? ['fast', ...AUDIO_FORMATS] : ['fast', ...VIDEO_FORMATS];

  selectedFormat = saved.format || (isAudio ? 'mp3' : 'mp4');
  if (!allValidFmts.includes(selectedFormat)) selectedFormat = isAudio ? 'mp3' : 'mp4';
  applyOutputMode(outputMode, { persist: false });

  // Instant clipboard refresh when window gains focus
  window.addEventListener('focus', () => { if (currentMode === 'clipboard') pollClipboard(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentMode === 'clipboard') pollClipboard();
  });

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
    if (changes.outputMode) {
      applyOutputMode(changes.outputMode.newValue || 'audio', { persist: false });
    }
    if (changes.format) {
      selectedFormat = changes.format.newValue || selectedFormat;
      syncFmtMainButtons();
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
    if (changes.downloadStatsJson || changes.downloadIssuesJson || changes.downloadedItemsJson) loadDashboardState();
    if (changes.defaultFolder && !folderSel.value) {
      folderSel.value = changes.defaultFolder.newValue || '';
      if (currentMode === 'bookmarks') refreshTotal(folderSel.value);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
