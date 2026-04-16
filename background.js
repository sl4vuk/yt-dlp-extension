/* background.js — YT Bookmark Cleaner v2.6 */
'use strict';

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
  terminated: 0,
};

let downloadIssues = {
  ageRestricted: [],
  unavailable: [],
  copyright: [],
  terminated: [],
};

// ── PANEL MODE (popup vs sidebar) ────────────────────────────────
let panelMode = 'popup'; // 'popup' or 'sidebar'
let sidePanelOpen = false;

async function loadPanelMode() {
  const data = await new Promise(r => chrome.storage.local.get('panelMode', r));
  panelMode = data.panelMode || 'popup';
  await updateActionBehavior();
}

async function loadDownloadState() {
  const data = await new Promise(r => chrome.storage.local.get(['downloadStatsJson', 'downloadIssuesJson'], r));

  if (data?.downloadStatsJson) {
    try {
      const parsed = JSON.parse(data.downloadStatsJson);
      downloadStats = {
        downloaded: Number(parsed.downloaded) || 0,
        ageRestricted: Number(parsed.ageRestricted) || 0,
        unavailable: Number(parsed.unavailable) || 0,
        copyright: Number(parsed.copyright) || 0,
        terminated: Number(parsed.terminated) || 0,
      };
    } catch {}
  }

  if (data?.downloadIssuesJson) {
    try {
      const parsed = JSON.parse(data.downloadIssuesJson);
      downloadIssues = {
        ageRestricted: Array.isArray(parsed.ageRestricted) ? parsed.ageRestricted : [],
        unavailable: Array.isArray(parsed.unavailable) ? parsed.unavailable : [],
        copyright: Array.isArray(parsed.copyright) ? parsed.copyright : [],
        terminated: Array.isArray(parsed.terminated) ? parsed.terminated : [],
      };
    } catch {}
  }
}

function persistDownloadState() {
  chrome.storage.local.set({
    downloadStatsJson: JSON.stringify(downloadStats),
    downloadIssuesJson: JSON.stringify(downloadIssues),
  });
}

async function updateActionBehavior() {
  if (panelMode === 'sidebar') {
    // Remove popup so clicking the icon opens sidebar
    await chrome.action.setPopup({ popup: '' });
    // Enable side panel
    if (chrome.sidePanel) {
      await chrome.sidePanel.setOptions({
        path: 'ui.html?mode=sidebar',
        enabled: true
      });
      try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
      } catch {}
    }
  } else {
    // Popup mode — set default popup
    await chrome.action.setPopup({ popup: 'ui.html' });
    if (chrome.sidePanel) {
      try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
      } catch {}
      await chrome.sidePanel.setOptions({ enabled: false });
    }
  }
}

// ── COMMANDS ─────────────────────────────────────────────────────
chrome.commands?.onCommand.addListener(async cmd => {
  if (cmd === 'quick-download') await handleQuickDownload();
});

async function handleToggleUI() {
  if (panelMode === 'sidebar') {
    // Toggle sidebar
    if (chrome.sidePanel) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs?.[0];
      if (!tab) return;
      try {
        if (sidePanelOpen) {
          // Close sidebar by disabling it
          await chrome.sidePanel.setOptions({ enabled: false });
          sidePanelOpen = false;
          // Re-enable for next toggle
          setTimeout(async () => {
            await chrome.sidePanel.setOptions({
              path: 'ui.html?mode=sidebar',
              enabled: true
            });
          }, 100);
        } else {
          await chrome.sidePanel.setOptions({
            path: 'ui.html?mode=sidebar',
            enabled: true
          });
          await chrome.sidePanel.open({ windowId: tab.windowId });
          sidePanelOpen = true;
        }
      } catch (e) {
        // If open fails, try to open via toggling
        try {
          await chrome.sidePanel.open({ windowId: tab.windowId });
          sidePanelOpen = true;
        } catch {}
      }
    }
  } else {
    // Popup mode — open as normal popup (extension popup opens automatically with default_popup)
    // But when triggered via command, we need to use action.openPopup() if available
    try {
      await chrome.action.openPopup();
    } catch {
      // Fallback: open in tab
      chrome.tabs.create({ url: chrome.runtime.getURL('ui.html?mode=tab') });
    }
  }
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

function classifyError(errText = '') {
  const text = String(errText).toLowerCase();
  if (text.includes('confirm your age') || text.includes('inappropriate for some users') || text.includes('sign in to confirm your age')) {
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

function sanitizeIssueItem(item, bucket) {
  if (!item) return null;
  return {
    reason: bucket,
    url: item.sourceUrl || item.url || '',
    title: item.title || item.videoId || 'Unknown title',
    videoId: item.videoId || '',
    sourceMode: item.sourceMode || 'unknown',
    addedAt: Date.now(),
  };
}

function removeIssueMatch(item) {
  const sourceUrl = item?.sourceUrl || item?.url || '';
  const videoId = item?.videoId || '';
  Object.keys(downloadIssues).forEach(bucket => {
    downloadIssues[bucket] = downloadIssues[bucket].filter(entry => {
      if (sourceUrl && entry.url === sourceUrl) return false;
      if (videoId && entry.videoId === videoId) return false;
      return true;
    });
  });
}

function addIssue(bucket, item) {
  const issue = sanitizeIssueItem(item, bucket);
  if (!issue || !downloadIssues[bucket]) return;
  const existingIndex = downloadIssues[bucket].findIndex(entry =>
    (issue.url && entry.url === issue.url) ||
    (issue.videoId && entry.videoId === issue.videoId) ||
    (entry.title === issue.title && entry.reason === issue.reason)
  );
  if (existingIndex >= 0) {
    downloadIssues[bucket][existingIndex] = { ...downloadIssues[bucket][existingIndex], ...issue };
  } else {
    downloadIssues[bucket].unshift(issue);
  }
}

function updateStatsFromResult(result, item) {
  if (!result) return;

  if (result.success || result.skipped) {
    if (result.success) {
      downloadStats.downloaded += 1;
    }
    removeIssueMatch(item);
    persistDownloadState();
    return;
  }

  const bucket = classifyError(result.error || '');
  if (!bucket) return;

  downloadStats[bucket] += 1;
  addIssue(bucket, item);
  persistDownloadState();
}

function getDownloadDashboardState() {
  return {
    stats: { ...downloadStats },
    issues: {
      ageRestricted: [...downloadIssues.ageRestricted],
      unavailable: [...downloadIssues.unavailable],
      copyright: [...downloadIssues.copyright],
      terminated: [...downloadIssues.terminated],
    },
  };
}


// ── QUICK DOWNLOAD (Alt+F) ──────────────────────────────────────
async function handleQuickDownload() {
  // Check if quick download is enabled
  const settings = await new Promise(r => chrome.storage.local.get('quickDownloadEnabled', r));
  if (settings.quickDownloadEnabled === false) return;

  const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
  const tab = tabs?.[0];
  if (!tab) return;

  const vid = extractVideoId(tab.url || '');
  if (!vid) {
    chrome.tabs.sendMessage(tab.id, { type: 'QUICK_DOWNLOAD_TOAST', msg: '⚠️ No video found on this tab' }).catch(() => {});
    return;
  }

  const data = await new Promise(r =>
    chrome.storage.local.get(['downloadPath', 'format', 'downloadCookieMode'], r)
  );

  const outputPath = data.downloadPath || '';
  if (!outputPath) {
    chrome.tabs.sendMessage(tab.id, { type: 'QUICK_DOWNLOAD_TOAST', msg: '⚠️ Set output folder in the extension first' }).catch(() => {});
    return;
  }

  const fmt = data.format === 'mp3' ? 'mp3' : 'fast';
  const url = makeYTUrl(vid);
  const title = (tab.title || vid)
    .replace(/ - YouTube.*$/i, '')
    .replace(/ - YouTube Music.*$/i, '')
    .trim();

  chrome.tabs.sendMessage(tab.id, { type: 'QUICK_DOWNLOAD_TOAST', msg: `⬇️ Downloading: ${title}` }).catch(() => {});

  chrome.runtime.sendMessage({
    type: 'QUEUE_UPDATE',
    current: 1,
    total: 1,
    title
  }).catch(() => {});

  const result = await downloadTrackNative({ url, videoId: vid, title, format: fmt, outputPath, cookieMode: data.downloadCookieMode || 'off' });

  updateStatsFromResult(result, { url, sourceUrl: url, videoId: vid, title, sourceMode: 'quick-download' });

  const toastMsg = result.skipped
    ? `⟳ Already downloaded: ${title}`
    : result.success
      ? `✓ Downloaded: ${title}`
      : `✗ Error: ${result.error || 'unknown'}`;

  chrome.tabs.sendMessage(tab.id, { type: 'QUICK_DOWNLOAD_TOAST', msg: toastMsg }).catch(() => {});

  chrome.runtime.sendMessage({ type: 'QUEUE_RESULT', videoId: vid, title, result, item: { url, sourceUrl: url, videoId: vid, title, sourceMode: 'quick-download' } }).catch(() => {});
  chrome.runtime.sendMessage({ type: 'QUEUE_DONE', cancelled: false }).catch(() => {});
}

// ── BOOKMARK CURRENT (from content script) ───────────────────────
async function bookmarkCurrent(url, title) {
  const clean = cleanUrl(url);
  if (!clean) return;

  const storage = await new Promise(r => chrome.storage.local.get(['lastFolder', 'defaultFolder'], r));
  const parentId = storage.lastFolder || storage.defaultFolder || '1';

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
      await new Promise(r => chrome.bookmarks.remove(dirty.id, r));
      cleaned++;
    }

    const needYT    = !entry.yt;
    const needMusic = !entry.music;

    if (needYT && !needMusic) {
      const title = entry.music.title;
      const data  = { parentId: folderId, title, url: makeYTUrl(vid) };
      creates.push(new Promise(r => chrome.bookmarks.create(data, r)));
      synced++;
    } else if (!needYT && needMusic) {
      const title = entry.yt.title;
      const data  = { parentId: folderId, title, url: makeMusicUrl(vid) };
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

  if (msg.type === 'progress') {
    chrome.runtime.sendMessage({
      type: 'DOWNLOAD_PROGRESS',
      videoId: msg.videoId,
      percent: msg.percent,
      size:    msg.size,
      eta:     msg.eta
    }).catch(() => {});
  }

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

  if (msg.type === 'resolved_path') {
    const p = pendingDownloads.get('__resolve__');
    if (p) {
      p.resolve({ path: msg.path || null });
      pendingDownloads.delete('__resolve__');
    }
  }

  if (msg.type === 'open_folder_result') {
    const p = pendingDownloads.get('__open_folder__');
    if (p) {
      p.resolve({ ok: msg.ok === true, error: msg.error || null });
      pendingDownloads.delete('__open_folder__');
    }
  }
}

function downloadTrackNative({ url, videoId, title, format, outputPath, cookieMode = 'off' }) {
  return new Promise(resolve => {
    const port = getNativePort();
    if (!port) {
      resolve({ success: false, error: 'Native host not installed. See README.' });
      return;
    }
    pendingDownloads.set(videoId, { resolve });
    port.postMessage({ action: 'download', url, videoId, title, format, outputPath, cookieMode, addMetadata: true });
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

function openFolderNative(folderPath) {
  return new Promise(resolve => {
    const port = getNativePort();
    if (!port) { resolve({ ok: false, error: 'Native host not installed. See README.' }); return; }

    pendingDownloads.set('__open_folder__', { resolve });
    port.postMessage({ action: 'open_folder', folderPath });

    setTimeout(() => {
      if (pendingDownloads.has('__open_folder__')) {
        pendingDownloads.delete('__open_folder__');
        resolve({ ok: false, error: 'Open folder timed out' });
      }
    }, 5000);
  });
}

// ── BACKGROUND DOWNLOAD QUEUE ─────────────────────────────────────

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
    updateStatsFromResult(result, item);

    chrome.runtime.sendMessage({
      type:    'QUEUE_RESULT',
      videoId: item.videoId,
      title:   item.title,
      result,
      item,
    }).catch(() => {});

    currentIndex++;
  }

  chrome.runtime.sendMessage({ type: 'QUEUE_DONE', cancelled: queueCancelled }).catch(() => {});

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
  const reply = payload => {
    try { sendResponse(payload); } catch {}
  };
  const replyError = error => reply({ ok: false, error: error?.message || String(error || 'Unknown error') });

  if (msg.type === 'SYNC_FOLDER') {
    syncFolder(msg.folderId, reply).catch(replyError);
    return true;
  }
  if (msg.type === 'START_DOWNLOAD_QUEUE') {
    downloadQueue = msg.queue;
    currentIndex  = 0;
    cancelRequested = false;
    processQueue();
    reply({ ok: true });
    return false;
  }
  if (msg.type === 'CANCEL_DOWNLOAD_QUEUE') {
    cancelRequested = true;
    const port = getNativePort();
    if (port) {
      try { port.postMessage({ action: 'cancel' }); } catch {}
    }
    reply({ ok: true });
    return false;
  }
  if (msg.type === 'DOWNLOAD_TRACK') {
    downloadTrackNative({
      url:        cleanUrl(msg.url) || msg.url,
      videoId:    msg.videoId,
      title:      msg.title,
      format:     msg.format,
      outputPath: msg.outputPath,
      cookieMode: msg.cookieMode,
    }).then(reply).catch(replyError);
    return true;
  }
  if (msg.type === 'RESOLVE_PATH') {
    resolvePathNative(msg.folderName).then(reply).catch(replyError);
    return true;
  }
  if (msg.type === 'OPEN_DOWNLOAD_FOLDER') {
    openFolderNative(msg.folderPath).then(reply).catch(replyError);
    return true;
  }

  if (msg.type === 'BOOKMARK_CURRENT') {
    bookmarkCurrent(msg.url, msg.title);
    reply({ ok: true });
    return false;
  }
  if (msg.type === 'GET_TOTAL') {
    getTotalUnique(msg.folderId).then(total => reply({ total })).catch(replyError);
    return true;
  }
  if (msg.type === 'GET_QUEUE_STATE') {
    reply(getQueueState());
    return false;
  }
  if (msg.type === 'GET_DOWNLOAD_DASHBOARD_STATE') {
    reply(getDownloadDashboardState());
    return false;
  }
  if (msg.type === 'SET_PANEL_MODE') {
    panelMode = msg.mode;
    Promise.resolve(updateActionBehavior()).then(() => reply({ ok: true })).catch(replyError);
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.panelMode) {
    panelMode = changes.panelMode.newValue || 'popup';
    updateActionBehavior();
  }
  if (changes.downloadStatsJson || changes.downloadIssuesJson) {
    loadDownloadState();
  }
});

// ── SIDE PANEL LIFECYCLE ─────────────────────────────────────────
if (chrome.sidePanel?.onStateChanged) {
  chrome.sidePanel.onStateChanged.addListener(({ open }) => {
    sidePanelOpen = open;
  });
}

// ── INIT ─────────────────────────────────────────────────────────
loadDownloadState();
loadPanelMode();
