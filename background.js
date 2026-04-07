/* background.js — YT Bookmark Cleaner v2.1 */
'use strict';

let undoStack = [];

// ── OPEN UI ──────────────────────────────────────────────────────
chrome.commands?.onCommand.addListener(cmd => {
  if (cmd === 'toggle-ui') openPopup();
  if (cmd === 'auto-like') handleAutoLike();
});

chrome.action.onClicked.addListener(() => openPopup());

function openPopup() {
  chrome.windows.create({
    url: chrome.runtime.getURL('ui.html'),
    type: 'popup',
    width: 360,
    height: 640
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

  // Get the saved target folder
  const { lastFolder } = await new Promise(r => chrome.storage.local.get('lastFolder', r));
  const parentId = lastFolder || '1'; // fallback to Bookmarks bar

  // Check if already bookmarked in that folder
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
// - Cleans all URLs (strips dirty params)
// - Removes duplicates (same video ID, keep www version, delete music + dirty)
// - Adds missing YT or Music counterpart
async function syncFolder(folderId, sendResponse) {
  undoStack = [];

  const items = await new Promise(r => chrome.bookmarks.getChildren(folderId, r));

  // Step 1: Clean & deduplicate by video ID
  // Map: videoId -> { yt: bookmark, music: bookmark, dirties: [bookmark] }
  const byId = new Map();

  for (const b of items) {
    if (!b.url) continue;
    const clean = cleanUrl(b.url);

    if (!clean) {
      // Not a valid YT/Music watch URL (channel, playlist, etc.) — skip
      continue;
    }

    const vid = extractVideoId(clean);
    if (!vid) continue;

    if (!byId.has(vid)) byId.set(vid, { yt: null, music: null, dirties: [] });
    const entry = byId.get(vid);

    const cleanedAlready = (b.url === clean);
    const itIsYT = isYT(b.url) || isYT(clean);
    const itIsMusic = isMusic(b.url) || isMusic(clean);

    if (!cleanedAlready) {
      entry.dirties.push(b);
    } else if (itIsYT && !entry.yt) {
      entry.yt = b;
    } else if (itIsMusic && !entry.music) {
      entry.music = b;
    } else {
      // exact duplicate — mark as dirty to remove
      entry.dirties.push(b);
    }
  }

  let cleaned = 0;
  let synced = 0;
  const creates = [];

  for (const [vid, entry] of byId) {
    // Remove dirty URLs and real duplicates
    for (const dirty of entry.dirties) {
      undoStack.push({ action: 'create', data: { parentId: folderId, title: dirty.title, url: dirty.url } });
      await new Promise(r => chrome.bookmarks.remove(dirty.id, r));
      cleaned++;
    }

    // If there's a clean YT entry but we deleted a dirty one that was the only YT, reconstruct
    const needYT  = !entry.yt;
    const needMusic = !entry.music;

    if (needYT && !needMusic) {
      // Has music, create YT version
      const title = entry.music.title;
      const data = { parentId: folderId, title, url: makeYTUrl(vid) };
      undoStack.push({ action: 'removeByUrl', url: data.url, parentId: folderId });
      creates.push(new Promise(r => chrome.bookmarks.create(data, r)));
      synced++;
    } else if (!needYT && needMusic) {
      // Has YT, create Music version
      const title = entry.yt.title;
      const data = { parentId: folderId, title, url: makeMusicUrl(vid) };
      undoStack.push({ action: 'removeByUrl', url: data.url, parentId: folderId });
      creates.push(new Promise(r => chrome.bookmarks.create(data, r)));
      synced++;
    }
  }

  await Promise.all(creates);

  // Count total unique songs now
  const finalItems = await new Promise(r => chrome.bookmarks.getChildren(folderId, r));
  const uniqueIds = new Set();
  for (const b of finalItems) {
    if (!b.url) continue;
    const vid = extractVideoId(b.url);
    if (vid) uniqueIds.add(vid);
  }

  sendResponse({
    total: byId.size,
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
  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_PROGRESS',
    videoId: msg.videoId,
    percent: msg.percent,
    size: msg.size,
    eta: msg.eta
  }).catch(() => {});

  if (msg.type === 'done' || msg.type === 'error' || msg.type === 'skipped') {
    const p = pendingDownloads.get(msg.videoId);
    if (p) { p.resolve({ success: msg.type !== 'error', error: msg.error }); pendingDownloads.delete(msg.videoId); }
  }
}

function downloadTrackNative({ url, videoId, title, format, outputPath }) {
  return new Promise(resolve => {
    const port = getNativePort();
    if (!port) { resolve({ success: false, error: 'Native host not installed. See README.' }); return; }
    pendingDownloads.set(videoId, { resolve });
    port.postMessage({ action: 'download', url, videoId, title, format, outputPath, addMetadata: true });
    setTimeout(() => {
      if (pendingDownloads.has(videoId)) { pendingDownloads.delete(videoId); resolve({ success: false, error: 'Timeout' }); }
    }, 600000);
  });
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
  if (msg.type === 'DOWNLOAD_TRACK') {
    downloadTrackNative({
      url: cleanUrl(msg.url) || msg.url,
      videoId: msg.videoId,
      title: msg.title,
      format: msg.format,
      outputPath: msg.outputPath
    }).then(sendResponse);
    return true;
  }
  if (msg.type === 'OPEN_WINDOW') {
    chrome.windows.create({ url: chrome.runtime.getURL('ui.html'), type: 'popup', width: 520, height: 700 });
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
});
