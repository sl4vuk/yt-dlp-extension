/* ui.js — YT Bookmark Cleaner v2.1 */
'use strict';

const store = {
  get: k => new Promise(r => chrome.storage.local.get(k, r)),
  set: o => new Promise(r => chrome.storage.local.set(o, r)),
};

// ── DOM ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const html        = document.documentElement;
const folderSel   = $('folderSelect');
const totalNum    = $('total-num');
const syncStats   = $('sync-stats');
const sScanned    = $('s-scanned');
const sSynced     = $('s-synced');
const sSkipped    = $('s-skipped');
const btnSync     = $('btn-sync');
const btnUndo     = $('btn-undo');
const btnDownload = $('btn-download');
const btnTheme    = $('btn-theme');
const iconMoon    = $('icon-moon');
const iconSun     = $('icon-sun');
const pathDisplay = $('path-display');
const pathText    = $('path-text');
const progressSec = $('progress-section');
const dlBar       = $('dl-bar');
const dlFilename  = $('dl-filename');
const dlSize      = $('dl-size');
const dlEta       = $('dl-eta');
const dlCurrent   = $('dl-current');
const dlTotal     = $('dl-total');
const dlPct       = $('dl-pct');
const dlLog       = $('dl-log');
const toastEl     = $('toast');
const exportToggle= $('export-toggle');
const exportBody  = $('export-body');

let selectedFormat  = 'm4a';
let downloadHandle  = null; // FileSystemDirectoryHandle
let toastTimer;

// ── TOAST ─────────────────────────────────────────────────────────
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ── THEME ─────────────────────────────────────────────────────────
function applyTheme(t) {
  html.setAttribute('data-theme', t);
  iconMoon.style.display = t === 'dark'  ? '' : 'none';
  iconSun.style.display  = t === 'light' ? '' : 'none';
}

btnTheme.addEventListener('click', async () => {
  const cur = html.getAttribute('data-theme');
  const nxt = cur === 'dark' ? 'light' : 'dark';
  applyTheme(nxt);
  await store.set({ theme: nxt });
});

// ── VIEW MODES ────────────────────────────────────────────────────
$('btn-window').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_WINDOW' });
  window.close();
});
$('btn-tab').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('ui.html') });
  window.close();
});

// ── EXPORT COLLAPSIBLE ────────────────────────────────────────────
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

      if (fmt === 'txt') {
        content = bms.map(b => `${b.title || ''}\n${b.url}\n`).join('\n');
      }
      if (fmt === 'csv') {
        mime = 'text/csv';
        content = 'title,url\n' + bms
          .map(b => `"${(b.title || '').replace(/"/g, '""')}","${b.url}"`)
          .join('\n');
      }
      if (fmt === 'html') {
        mime = 'text/html';
        const now = Math.floor(Date.now() / 1000);
        const links = bms.map(b =>
          `<DT><A HREF="${b.url}" ADD_DATE="${now}">${esc(b.title || '')}</A>`
        ).join('\n');
        content = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${links}\n</DL><p>`;
      }

      const blob = new Blob([content], { type: mime });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `bookmarks.${ext}`; a.click();
      URL.revokeObjectURL(url);
      toast(`Exported as ${fmt.toUpperCase()}`);
    });
  });
});

function esc(s) {
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
}

// ── FORMAT TOGGLE ─────────────────────────────────────────────────
document.querySelectorAll('.to').forEach(b => {
  b.addEventListener('click', async () => {
    document.querySelectorAll('.to').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    selectedFormat = b.dataset.fmt;
    await store.set({ format: selectedFormat });
  });
});

// ── FOLDER SELECT + TOTAL COUNTER ────────────────────────────────
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
  syncStats.classList.remove('show'); // hide sync stats when folder changes
});

// ── OUTPUT FOLDER PICKER ──────────────────────────────────────────
pathDisplay.addEventListener('click', async () => {
  try {
    downloadHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const path = downloadHandle.name;
    pathText.textContent = path;
    await store.set({ downloadPath: path, downloadPathName: path });
    toast('Folder selected');
  } catch { /* user cancelled */ }
});

// ── SYNC ─────────────────────────────────────────────────────────
btnSync.addEventListener('click', async () => {
  const fid = folderSel.value;
  if (!fid) { toast('Select a folder first'); return; }
  btnSync.disabled = true;
  const origText = btnSync.innerHTML;
  btnSync.textContent = 'Working…';

  chrome.runtime.sendMessage({ type: 'SYNC_FOLDER', folderId: fid }, res => {
    btnSync.disabled = false;
    btnSync.innerHTML = origText;
    if (!res) { toast('Error'); return; }

    sScanned.textContent = res.total ?? 0;
    sSynced.textContent  = res.synced ?? 0;
    sSkipped.textContent = res.skipped ?? 0;
    syncStats.classList.add('show');

    refreshTotal(fid);
    toast(`Synced ${res.synced} · Cleaned ${res.cleaned ?? 0}`);
  });
});

// ── UNDO ──────────────────────────────────────────────────────────
btnUndo.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'UNDO' }, () => {
    toast('Undo applied');
    refreshTotal(folderSel.value);
  });
});

// ── DOWNLOAD ─────────────────────────────────────────────────────
btnDownload.addEventListener('click', () => {
  const fid = folderSel.value;
  if (!fid)           { toast('Select a bookmark folder first'); return; }
  if (!downloadHandle){ toast('Select output folder first'); return; }

  chrome.bookmarks.getChildren(fid, async items => {
    const bms = items.filter(b => b.url);
    if (!bms.length) { toast('No bookmarks found'); return; }

    // Deduplicate by video ID, prefer youtube.com
    const byId = new Map();
    bms.forEach(b => {
      try {
        const u   = new URL(b.url);
        const vid = u.searchParams.get('v');
        if (!vid) return;
        const cleanUrl = `https://www.youtube.com/watch?v=${vid}`;
        const ex = byId.get(vid);
        if (!ex || u.hostname === 'www.youtube.com') {
          byId.set(vid, { ...b, videoId: vid, cleanUrl });
        }
      } catch {}
    });

    await startDownload([...byId.values()]);
  });
});

async function startDownload(queue) {
  progressSec.classList.add('visible');
  dlLog.innerHTML = '';
  dlTotal.textContent = queue.length;
  btnDownload.disabled = true;
  btnDownload.textContent = 'Downloading…';

  let skipped = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    dlCurrent.textContent = i + 1;
    dlFilename.textContent = item.title || item.videoId;
    dlPct.textContent = '—';
    dlBar.style.width = '0%';
    dlSize.textContent = '—';
    dlEta.textContent = '—';

    const exists = await fileExists(downloadHandle, item.videoId);
    if (exists) {
      appendLog(`⟳ ${item.title || item.videoId}`, 'skip');
      skipped++;
      continue;
    }

    const result = await downloadTrack(item);
    appendLog(result.success ? `✓ ${item.title || item.videoId}` : `✗ ${item.title || item.videoId}: ${result.error || ''}`,
              result.success ? 'ok' : 'err');
  }

  dlFilename.textContent = `Done · ${queue.length - skipped} downloaded · ${skipped} skipped`;
  dlBar.style.width = '100%';
  dlPct.textContent = '100%';
  btnDownload.disabled = false;
  btnDownload.textContent = 'Download All';
  toast('Download complete');
}

function downloadTrack(item) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_TRACK',
      url: item.cleanUrl,
      videoId: item.videoId,
      title: item.title,
      format: selectedFormat,
      outputPath: downloadHandle.name
    }, res => resolve(res || { success: false, error: 'No response' }));

    const onProgress = msg => {
      if (msg.type === 'DOWNLOAD_PROGRESS' && msg.videoId === item.videoId) {
        const pct = Math.round(msg.percent || 0);
        dlBar.style.width = pct + '%';
        dlPct.textContent = pct + '%';
        if (msg.size) dlSize.textContent = msg.size;
        if (msg.eta)  dlEta.textContent = msg.eta;
      }
    };
    chrome.runtime.onMessage.addListener(onProgress);
    setTimeout(() => chrome.runtime.onMessage.removeListener(onProgress), 600000);
  });
}

async function fileExists(dirHandle, videoId) {
  if (!dirHandle) return false;
  try {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.includes(videoId)) return true;
    }
  } catch {}
  return false;
}

function appendLog(msg, cls = '') {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = msg;
  dlLog.appendChild(d);
  dlLog.scrollTop = dlLog.scrollHeight;
}

// ── INIT ──────────────────────────────────────────────────────────
async function init() {
  const saved = await store.get(['theme', 'format', 'downloadPathName', 'lastFolder']);

  // Theme
  applyTheme(saved.theme || 'dark');

  // Format
  if (saved.format) {
    selectedFormat = saved.format;
    document.querySelectorAll('.to').forEach(b =>
      b.classList.toggle('on', b.dataset.fmt === selectedFormat)
    );
  }

  // Saved folder path label
  if (saved.downloadPathName) {
    pathText.textContent = saved.downloadPathName;
  }

  // Build bookmark tree
  await new Promise(r => chrome.bookmarks.getTree(tree => {
    folderSel.innerHTML = '';
    buildTree(tree);
    r();
  }));

  // Restore folder selection
  if (saved.lastFolder) {
    folderSel.value = saved.lastFolder;
    if (!folderSel.value) folderSel.selectedIndex = 0; // fallback
  }

  refreshTotal(folderSel.value);
}

document.addEventListener('DOMContentLoaded', init);
