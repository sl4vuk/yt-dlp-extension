/* ui.js — YT Bookmark Cleaner v2.5 */
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
const btnUndo = $('btn-undo');
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

const cDownloaded = $('c-downloaded');
const cAge = $('c-age');
const cUnavailable = $('c-unavailable');
const cCopyright = $('c-copyright');
const cTerminated = $('c-terminated');

let selectedFormat = 'fast';
let toastTimer;
let pathSaveTimer;
let isDownloading = false;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function applyTheme(t) {
  html.setAttribute('data-theme', t);
  iconMoon.style.display = t === 'dark' ? '' : 'none';
  iconSun.style.display = t === 'light' ? '' : 'none';
}

function applyDownloadButtonState(downloading) {
  isDownloading = !!downloading;
  btnDownload.textContent = downloading ? 'Cancel' : 'Download All';
  btnDownload.classList.toggle('cancel', downloading);
}

function normalizeErrorStats(raw = {}) {
  return {
    downloaded: raw.downloaded || 0,
    ageRestricted: raw.ageRestricted || 0,
    unavailable: raw.unavailable || 0,
    copyright: raw.copyright || 0,
    terminated: raw.terminated || 0,
  };
}

async function loadErrorStats() {
  const res = await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_DOWNLOAD_STATS' }, r => resolve(r || {}));
  });
  const stats = normalizeErrorStats(res.stats);
  cDownloaded.textContent = stats.downloaded;
  cAge.textContent = stats.ageRestricted;
  cUnavailable.textContent = stats.unavailable;
  cCopyright.textContent = stats.copyright;
  cTerminated.textContent = stats.terminated;
}

btnTheme.addEventListener('click', async () => {
  const nxt = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(nxt);
  await store.set({ theme: nxt });
});

$('btn-window').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_WINDOW' });
  window.close();
});
$('btn-tab').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('ui.html?mode=tab') });
  window.close();
});

exportToggle.addEventListener('click', () => {
  const open = exportBody.classList.toggle('open');
  exportToggle.classList.toggle('open', open);
});

document.querySelectorAll('[data-export]').forEach(btn => {
  btn.addEventListener('click', () => {
    const fmt = btn.dataset.export;
    const fid = folderSel.value;
    if (!fid) { toast('Select a folder first'); return; }
    chrome.bookmarks.getChildren(fid, items => {
      const bms = items.filter(b => b.url);
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
    });
  });
});

function esc(s) {
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

document.querySelectorAll('.to').forEach(b => {
  b.addEventListener('click', async () => {
    document.querySelectorAll('.to').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    selectedFormat = b.dataset.fmt;
    await store.set({ format: selectedFormat });
  });
});

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
  if (!folderId) { totalNum.textContent = '—'; return; }
  chrome.runtime.sendMessage({ type: 'GET_TOTAL', folderId }, res => {
    totalNum.textContent = res?.total ?? '—';
  });
}

folderSel.addEventListener('change', async () => {
  const fid = folderSel.value;
  await store.set({ lastFolder: fid });
  refreshTotal(fid);
  syncStats.classList.remove('show');
});

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
    const res = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'RESOLVE_PATH', folderName: name }, r => resolve(r));
    });
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

btnSync.addEventListener('click', async () => {
  const fid = folderSel.value;
  if (!fid) { toast('Select a folder first'); return; }
  btnSync.disabled = true;
  const orig = btnSync.innerHTML;
  btnSync.textContent = 'Working…';

  chrome.runtime.sendMessage({ type: 'SYNC_FOLDER', folderId: fid }, res => {
    btnSync.disabled = false;
    btnSync.innerHTML = orig;
    if (!res) { toast('Error'); return; }
    sScanned.textContent = res.total ?? 0;
    sSynced.textContent = res.synced ?? 0;
    sSkipped.textContent = res.skipped ?? 0;
    syncStats.classList.add('show');
    refreshTotal(fid);
    toast(`Synced ${res.synced} · Cleaned ${res.cleaned ?? 0}`);
  });
});

btnUndo.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'UNDO' }, () => {
    toast('Undo applied');
    refreshTotal(folderSel.value);
  });
});

btnDownload.addEventListener('click', async () => {
  if (isDownloading) {
    chrome.runtime.sendMessage({ type: 'CANCEL_DOWNLOAD_QUEUE' }, () => {
      toast('Download cancelled');
      applyDownloadButtonState(false);
    });
    return;
  }

  const fid = folderSel.value;
  if (!fid) { toast('Select a bookmark folder first'); return; }

  const outputPath = pathInput.value.trim();
  if (!outputPath) {
    toast('Set the output folder path first');
    pathInput.focus();
    return;
  }

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
          videoId: vid,
          title: b.title,
          format: selectedFormat,
          outputPath
        });
      } catch {}
    });

    chrome.runtime.sendMessage({ type: 'START_DOWNLOAD_QUEUE', queue }, () => {
      applyDownloadButtonState(true);
    });
    toast('Download started in background');

    dlLog.innerHTML = '';
    dlTotal.textContent = queue.length;
    dlCurrent.textContent = '0';
    dlFilename.textContent = 'Starting…';
  });
});

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
    loadErrorStats();
  }

  if (msg.type === 'QUEUE_DONE') {
    dlFilename.textContent = msg.cancelled ? 'Cancelled' : 'Done';
    dlBar.style.width = msg.cancelled ? '0%' : '100%';
    dlPct.textContent = msg.cancelled ? '—' : '100%';
    applyDownloadButtonState(false);
    toast(msg.cancelled ? 'Download cancelled' : 'All downloads finished');
    loadErrorStats();
  }
});

function appendLog(msg, cls = '') {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = msg;
  dlLog.appendChild(d);
  dlLog.scrollTop = dlLog.scrollHeight;
}

function initResizableSidebar() {
  if (!splitter) return;
  let active = false;
  const COMPACT_BREAKPOINT = 980;
  const MIN_SIDEBAR_WIDTH = 300;
  const MAX_SIDEBAR_WIDTH = 560;
  const MIN_TERMINAL_WIDTH = 320;

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

async function init() {
  const mode = new URLSearchParams(location.search).get('mode') || 'popup';
  document.body.classList.toggle('tab-mode', mode === 'tab');
  document.body.classList.toggle('popup-mode', mode !== 'tab');

  const saved = await store.get(['theme', 'format', 'downloadPath', 'lastFolder']);
  applyTheme(saved.theme || 'dark');

  if (saved.format) {
    selectedFormat = saved.format === 'm4a' ? 'fast' : saved.format;
    document.querySelectorAll('.to').forEach(b => b.classList.toggle('on', b.dataset.fmt === selectedFormat));
  }

  if (saved.downloadPath) {
    pathInput.value = saved.downloadPath;
    pathInput.classList.add('has-path');
  }

  await new Promise(r => chrome.bookmarks.getTree(tree => {
    folderSel.innerHTML = '';
    buildTree(tree);
    r();
  }));

  if (saved.lastFolder) {
    folderSel.value = saved.lastFolder;
    if (!folderSel.value) folderSel.selectedIndex = 0;
  }

  refreshTotal(folderSel.value);
  loadErrorStats();

  const qState = await new Promise(resolve => {
    chrome.runtime.sendMessage({ type: 'GET_QUEUE_STATE' }, res => resolve(res || {}));
  });

  if (qState.isDownloading) {
    applyDownloadButtonState(true);
    dlCurrent.textContent = qState.current || 0;
    dlTotal.textContent = qState.total || 0;
    dlFilename.textContent = qState.title || 'Downloading…';
  }

  if (mode === 'tab') initResizableSidebar();
}

document.addEventListener('DOMContentLoaded', init);
