/* background.js — YT Bookmark Cleaner v2.3 */
'use strict';

let undoStack = [];

// ── DOWNLOAD QUEUE ───────────────────────────────────────────────
let downloadQueue = [];
let isDownloading = false;
let currentIndex = 0;
let currentTitle = '';
let cancelRequested = false;
let queueCancelled = false;

let downloadStats = {
  downloaded: 0,
  ageRestricted: 0,
  unavailable: 0,
  copyright: 0,
  terminated: 0
};

async function loadDownloadStats() {
  const data = await new Promise(r => chrome.storage.local.get('downloadStatsJson', r));
  if (!data?.downloadStatsJson) return;
  try {
    const parsed = JSON.parse(data.downloadStatsJson);
    downloadStats = {
      downloaded: Number(parsed.downloaded) || 0,
      ageRestricted: Number(parsed.ageRestricted) || 0,
      unavailable: Number(parsed.unavailable) || 0,
      copyright: Number(parsed.copyright) || 0,
      terminated: Number(parsed.terminated) || 0
    };
  } catch {}
}

function persistDownloadStats() {
  chrome.storage.local.set({ downloadStatsJson: JSON.stringify(downloadStats) });
}

// ── OPEN UI ──────────────────────────────────────────────────────
// Wide layout in window/tab mode with resizable sidebar.
const UI_WIDTH  = 1240;
const UI_HEIGHT = 760;

chrome.commands?.onCommand.addListener(cmd => {
  if (cmd === 'toggle-ui') openPopup();
  if (cmd === 'auto-like') handleAutoLike();
});

chrome.action.onClicked.addListener(() => openPopup());

function openPopup() {
  chrome.windows.create({
    url: chrome.runtime.getURL('ui.html?mode=popup'),
    type: 'popup',
    width: UI_WIDTH,
    height: UI_HEIGHT
  });
}

// ── URL HELPERS ──────────────────────────────────────────────────
function cleanUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname;
    if (host !== 'www.youtube.com' && host !== 'music.youtube.com') return null;
    if (u.pathname !== '/watch') return null;
    const vid = u.searchParams.get('v');
    if (!vid) return null;
    return `${u.origin}/watch?v=${vid}`;
  } catch { return null; }
}

function extractVideoId(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get('v') || null;
  } catch { return null; }
}

function isYT(url) {
  try { return new URL(url).hostname === 'www.youtube.com'; } catch { return false; }
}
function isMusic(url) {
  try { return new URL(url).hostname === 'music.youtube.com'; } catch { return false; }
}
function makeYTUrl(vid) { return `https://www.youtube.com/watch?v=${vid}`; }
function makeMusicUrl(vid) { return `https://music.youtube.com/watch?v=${vid}`; }

// ── AUTO LIKE RELAY ──────────────────────────────────────────────
function handleAutoLike() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'AUTO_LIKE' });
  });
}

// ── BOOKMARK CURRENT (from Ctrl+D in content script) ─────────────
async function bookmarkCurrent(url, title) {
  const clean = cleanUrl(url);
  if (!clean) return;

  const { lastFolder } = await new Promise(r => chrome.storage.local.get('lastFolder', r));
  const parentId = lastFolder || '1';

  const children = await new Promise(r => chrome.bookmarks.getChildren(parentId, r));
  const vid = extractVideoId(clean);
  const alreadyExists = children.some(b => {
    const bVid = extractVideoId(b.url || '');
    return bVid && bVid === vid;
  });

  if (!alreadyExists) {
    await new Promise(r => chrome.bookmarks.create({ parentId, title, url: clean }, r));
  }
}

// ── SYNC FOLDER ──────────────────────────────────────────────────
async function syncFolder(folderId, sendResponse) {
  undoStack = [];

  const items = await new Promise(r => chrome.bookmarks.getChildren(folderId, r));

  const byId = new Map();

  for (const b of items) {
    if (!b.url) continue;
    const clean = cleanUrl(b.url);

    if (!clean) continue;

    const vid = extractVideoId(clean);
    if (!vid) continue;

    if (!byId.has(vid)) byId.set(vid, { yt: null, music: null, dirties: [] });
    const entry = byId.get(vid);

    const cleanedAlready = (b.url === clean);
    const itIsYT    = isYT(b.url)    || isYT(clean);
    const itIsMusic = isMusic(b.url) || isMusic(clean);

    if (!cleanedAlready) {
      entry.dirties.push(b);
    } else if (itIsYT && !entry.yt) {
      entry.yt = b;
    } else if (itIsMusic && !entry.music) {
      entry.music = b;
    } else {
      entry.dirties.push(b);
    }
  }

  let cleaned = 0;
  let synced  = 0;
  const creates = [];

  for (const [vid, entry] of byId) {
    for (const dirty of entry.dirties) {
      undoStack.push({ action: 'create', data: { parentId: folderId, title: dirty.title, url: dirty.url } });
      await new Promise(r => chrome.bookmarks.remove(dirty.id, r));
      cleaned++;
    }

    const needYT    = !entry.yt;
    const needMusic = !entry.music;

    if (needYT && !needMusic) {
      const title = entry.music.title;
      const data  = { parentId: folderId, title, url: makeYTUrl(vid) };
      undoStack.push({ action: 'removeByUrl', url: data.url, parentId: folderId });
      creates.push(new Promise(r => chrome.bookmarks.create(data, r)));
      synced++;
    } else if (!needYT && needMusic) {
      const title = entry.yt.title;
      const data  = { parentId: folderId, title, url: makeMusicUrl(vid) };
      undoStack.push({ action: 'removeByUrl', url: data.url, parentId: folderId });
      creates.push(new Promise(r => chrome.bookmarks.create(data, r)));
      synced++;
    }
  }

  await Promise.all(creates);

  sendResponse({
    total:   byId.size,
    synced,
    cleaned,
    skipped: byId.size - synced
  });
}

// ── UNDO ─────────────────────────────────────────────────────────
async function applyUndo() {
  const ops = undoStack.slice().reverse();
  for (const op of ops) {
    if (op.action === 'create') {
      await new Promise(r => chrome.bookmarks.create(op.data, r));
    } else if (op.action === 'update') {
      await new Promise(r => chrome.bookmarks.update(op.id, op.old, r));
    } else if (op.action === 'removeByUrl') {
      const results = await new Promise(r => chrome.bookmarks.search({ url: op.url }, r));
      for (const b of results) {
        if (b.parentId === op.parentId) await new Promise(r => chrome.bookmarks.remove(b.id, r));
      }
    }
  }
  undoStack = [];
}

// ── NATIVE MESSAGING (yt-dlp) ─────────────────────────────────────
let nativePort = null;
const pendingDownloads = new Map();

function getNativePort() {
  if (nativePort) return nativePort;
  try {
    nativePort = chrome.runtime.connectNative('com.ytbookmark.ytdlp');
    nativePort.onMessage.addListener(handleNativeMessage);
    nativePort.onDisconnect.addListener(() => { nativePort = null; });
  } catch (e) {
    nativePort = null;
  }
  return nativePort;
}

function handleNativeMessage(msg) {
  if (!msg) return;

  // Forward progress updates to UI
  if (msg.type === 'progress') {
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_PROGRESS',
      videoId: msg.videoId,
      percent: msg.percent,
      size:    msg.size,
      eta:     msg.eta
    }).catch(() => {});
  }

  // Resolve the pending promise for done / error / skipped
  if (msg.type === 'done' || msg.type === 'error' || msg.type === 'skipped') {
    const p = pendingDownloads.get(msg.videoId);
    if (p) {
      p.resolve({
        success: msg.type === 'done',
        skipped: msg.type === 'skipped',
        error:   msg.error || null,
        warning: msg.warning || null
      });
      pendingDownloads.delete(msg.videoId);
    }
  }

  // Handle RESOLVE_PATH response
  if (msg.type === 'resolved_path') {
    const p = pendingDownloads.get('__resolve__');
    if (p) {
      p.resolve({ path: msg.path || null });
      pendingDownloads.delete('__resolve__');
    }
  }
}

function downloadTrackNative({ url, videoId, title, format, outputPath }) {
  return new Promise(resolve => {
    const port = getNativePort();
    if (!port) {
      resolve({ success: false, error: 'Native host not installed. See README.' });
      return;
    }
    pendingDownloads.set(videoId, { resolve });
    port.postMessage({ action: 'download', url, videoId, title, format, outputPath, addMetadata: true });
    setTimeout(() => {
      if (pendingDownloads.has(videoId)) {
        pendingDownloads.delete(videoId);
        resolve({ success: false, error: 'Timeout' });
      }
    }, 600000);
  });
}

function resolvePathNative(folderName) {
  return new Promise(resolve => {
    const port = getNativePort();
    if (!port) { resolve({ path: null }); return; }

    pendingDownloads.set('__resolve__', { resolve });
    port.postMessage({ action: 'resolve_path', folderName });

    setTimeout(() => {
      if (pendingDownloads.has('__resolve__')) {
        pendingDownloads.delete('__resolve__');
        resolve({ path: null });
      }
    }, 5000);
  });
}

// ── BACKGROUND DOWNLOAD QUEUE ─────────────────────────────────────

function classifyError(errText = '') {
  const text = String(errText).toLowerCase();
  if (text.includes('confirm your age') || text.includes('inappropriate for some users')) {
    return 'ageRestricted';
  }
  if (text.includes('copyright claim')) {
    return 'copyright';
  }
  if (text.includes('account associated with this video has been terminated') || text.includes('account has been terminated') || text.includes('channel has been terminated')) {
    return 'terminated';
  }
  if (text.includes('video unavailable') || text.includes('not available')) {
    return 'unavailable';
  }
  return null;
}

function updateStatsFromResult(result) {
  if (!result || result.skipped) return;
  if (result.success) {
    downloadStats.downloaded += 1;
    persistDownloadStats();
    return;
  }
  const bucket = classifyError(result.error || '');
  if (bucket) {
    downloadStats[bucket] += 1;
    persistDownloadStats();
  }
}

async function processQueue() {
  if (isDownloading) return;

  isDownloading = true;
  queueCancelled = false;

  while (currentIndex < downloadQueue.length) {
    if (cancelRequested) {
      queueCancelled = true;
      break;
    }
    const item = downloadQueue[currentIndex];

    chrome.runtime.sendMessage({
      type:    'QUEUE_UPDATE',
      current: currentIndex + 1,
      total:   downloadQueue.length,
      title:   item.title
    }).catch(() => {});

    currentTitle = item.title || '';

    const result = await downloadTrackNative(item);

    updateStatsFromResult(result);

    chrome.runtime.sendMessage({
      type:    'QUEUE_RESULT',
      videoId: item.videoId,
      title:   item.title,
      result
    }).catch(() => {});

    currentIndex++;
  }

  chrome.runtime.sendMessage({ type: 'QUEUE_DONE', cancelled: queueCancelled }).catch(() => {});

  // reset
  downloadQueue = [];
  currentIndex  = 0;
  currentTitle  = '';
  isDownloading = false;
  cancelRequested = false;
  queueCancelled = false;
}


function getQueueState() {
  return {
    isDownloading,
    current: isDownloading ? currentIndex + 1 : 0,
    total: downloadQueue.length,
    title: currentTitle
  };
}

// ── GET TOTAL UNIQUE SONGS ────────────────────────────────────────
async function getTotalUnique(folderId) {
  if (!folderId) return 0;
  const items = await new Promise(r => chrome.bookmarks.getChildren(folderId, r));
  const ids = new Set();
  for (const b of items) {
    if (!b.url) continue;
    const vid = extractVideoId(b.url);
    if (vid) ids.add(vid);
  }
  return ids.size;
}

// ── MESSAGE ROUTER ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SYNC_FOLDER') {
    syncFolder(msg.folderId, sendResponse);
    return true;
  }
  if (msg.type === 'UNDO') {
    applyUndo().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'START_DOWNLOAD_QUEUE') {
    downloadQueue = msg.queue;
    currentIndex  = 0;
    cancelRequested = false;
    processQueue();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'CANCEL_DOWNLOAD_QUEUE') {
    cancelRequested = true;
    const port = getNativePort();
    if (port) {
      try { port.postMessage({ action: 'cancel' }); } catch {}
    }
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'DOWNLOAD_TRACK') {
    downloadTrackNative({
      url:        cleanUrl(msg.url) || msg.url,
      videoId:    msg.videoId,
      title:      msg.title,
      format:     msg.format,
      outputPath: msg.outputPath
    }).then(sendResponse);
    return true;
  }
  if (msg.type === 'RESOLVE_PATH') {
    resolvePathNative(msg.folderName).then(sendResponse);
    return true;
  }
  if (msg.type === 'OPEN_WINDOW') {
    chrome.windows.create({
      url:    chrome.runtime.getURL('ui.html?mode=popup'),
      type:   'popup',
      width:  UI_WIDTH,
      height: UI_HEIGHT
    });
    return;
  }
  if (msg.type === 'BOOKMARK_CURRENT') {
    bookmarkCurrent(msg.url, msg.title);
    return;
  }
  if (msg.type === 'GET_TOTAL') {
    getTotalUnique(msg.folderId).then(total => sendResponse({ total }));
    return true;
  }
  if (msg.type === 'GET_QUEUE_STATE') {
    sendResponse(getQueueState());
    return true;
  }
  if (msg.type === 'GET_DOWNLOAD_STATS') {
    sendResponse({ stats: downloadStats });
    return true;
  }
});


loadDownloadStats();
