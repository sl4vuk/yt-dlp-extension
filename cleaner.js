/* cleaner.js — YT Bookmark Cleaner v2.2 */
(() => {
  'use strict';

  // ── URL NORMALISER ─────────────────────────────────────────────
  function extractVideoId(href) {
    try {
      const u = new URL(href);
      const host = u.hostname;
      if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
      if (host !== 'www.youtube.com' && host !== 'music.youtube.com') return null;
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null;
      if (u.pathname === '/watch') return u.searchParams.get('v');
      return null;
    } catch { return null; }
  }

  function makeCleanUrl(vid, base) {
    try {
      const u = new URL(base);
      const isMusic = u.hostname === 'music.youtube.com';
      const origin = isMusic ? 'https://music.youtube.com' : 'https://www.youtube.com';
      return `${origin}/watch?v=${vid}`;
    } catch { return `https://www.youtube.com/watch?v=${vid}`; }
  }

  function applyTargets(href, targets) {
    try {
      let u = new URL(href);
      const host = u.hostname;
      const all = targets.includes('all');

      // Expand shortened youtu.be
      if ((all || targets.includes('short')) && host === 'youtu.be') {
        const vid = u.pathname.slice(1).split('/')[0];
        if (vid) return `https://www.youtube.com/watch?v=${vid}`;
      }
      // Expand embed
      if ((all || targets.includes('embed')) && u.pathname.startsWith('/embed/')) {
        const vid = u.pathname.split('/')[2];
        if (vid) u = new URL(`https://www.youtube.com/watch?v=${vid}`);
      }

      const vid = u.searchParams.get('v');
      if (!vid) return href;

      const cleanBase = `${u.origin}/watch?v=${vid}`;
      const newUrl = new URL(cleanBase);

      const stripList = [];
      if (all || targets.includes('playlist'))   stripList.push('list', 'index');
      if (all || targets.includes('timestamps')) stripList.push('t', 'start', 'end');
      if (all || targets.includes('radio'))      stripList.push('start_radio', 'rv', 'rvi');

      u.searchParams.forEach((val, key) => {
        if (key === 'v') return;
        if (!stripList.includes(key)) newUrl.searchParams.set(key, val);
      });

      return newUrl.toString();
    } catch { return href; }
  }

  let cachedSettings = null;
  function getSettings() {
    if (cachedSettings) return Promise.resolve(cachedSettings);
    return new Promise(resolve => {
      chrome.storage.local.get(['urlCleanTrigger', 'urlCleanTargets'], data => {
        cachedSettings = {
          trigger: data.urlCleanTrigger || 'always',
          targets: (data.urlCleanTargets || 'all').split(',').map(s => s.trim()),
        };
        resolve(cachedSettings);
      });
    });
  }
  chrome.storage.onChanged.addListener(() => { cachedSettings = null; });

  async function getCleanUrl(href, triggerContext) {
    const s = await getSettings();
    if (s.trigger === 'off') return href;
    if (triggerContext && s.trigger !== 'always' && s.trigger !== triggerContext) return href;
    const vid = extractVideoId(href);
    if (!vid) return href;
    return applyTargets(href, s.targets);
  }

  async function cleanCurrentUrl() {
    const clean = await getCleanUrl(window.location.href, 'always');
    if (!clean || clean === window.location.href) return;
    history.replaceState(null, '', clean);
  }

  cleanCurrentUrl();

  let lastUrl = location.href;
  new MutationObserver(async () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      await cleanCurrentUrl();
    }
  }).observe(document, { subtree: true, childList: true });

  // ── LIKE BUTTON ────────────────────────────────────────────────
  function findByXPath(xpath) {
    try {
      return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)?.singleNodeValue || null;
    } catch { return null; }
  }

  function getLikeButton() {
    const host = location.hostname;

    if (host === 'www.youtube.com') {
      // Updated XPath from user DOM
      const btn = findByXPath(
        '/html/body/ytd-app/div[1]/ytd-page-manager/ytd-watch-flexy/div[4]/div[1]/div/div[2]/ytd-watch-metadata/div/div[3]/div/div/div/ytd-menu-renderer/div[1]/segmented-like-dislike-button-view-model/yt-smartimation/div/div/like-button-view-model/toggle-button-view-model/button-view-model/button'
      );
      if (btn) return btn;

      const fallbacks = [
        'like-button-view-model button',
        'segmented-like-dislike-button-view-model button',
        '#top-level-buttons-computed button[aria-label*="like" i]',
        'ytd-menu-renderer button[aria-label*="like" i]',
        // New YT spec button shape
        '.ytSpecButtonShapeNextSegmentedStart',
        'button[aria-label*="like" i]',
      ];
      for (const s of fallbacks) {
        const el = document.querySelector(s);
        if (el) return el;
      }
    }

    if (host === 'music.youtube.com') {
      // Updated XPath from user DOM
      const btn = findByXPath(
        '/html/body/ytmusic-app/ytmusic-app-layout/ytmusic-player-bar/div[2]/div[3]/ytmusic-like-button-renderer/yt-button-shape[2]/button'
      );
      if (btn) return btn;

      const fallbacks = [
        // New YT Music spec button shape (from provided HTML)
        '.yt-spec-button-shape-next[aria-label="Like"]',
        'ytmusic-like-button-renderer yt-button-shape:last-child button',
        'ytmusic-like-button-renderer button[aria-label*="Like" i]',
      ];
      for (const s of fallbacks) {
        const el = document.querySelector(s);
        if (el) return el;
      }
    }

    return null;
  }

  function triggerLike() {
    const btn = getLikeButton();
    if (!btn) { showToast('❌ Like button not found'); return; }
    const liked = btn.getAttribute('aria-pressed') === 'true';
    if (!liked) {
      btn.click();
      showToast('❤️ Liked');
    } else {
      showToast('❤️ Already liked');
    }
  }

  // ── GET UPLOADER ───────────────────────────────────────────────
  function getUploaderName() {
    const host = location.hostname;
    if (host === 'www.youtube.com') {
      return document.querySelector('#owner ytd-channel-name a')?.textContent?.trim()
        || document.querySelector('ytd-video-owner-renderer #channel-name a')?.textContent?.trim()
        || document.querySelector('#owner #channel-name a')?.textContent?.trim()
        || '';
    }
    if (host === 'music.youtube.com') {
      return document.querySelector('ytmusic-player-bar .byline a')?.textContent?.trim()
        || document.querySelector('.subtitle a.yt-simple-endpoint')?.textContent?.trim()
        || '';
    }
    return '';
  }

  // ── BOOKMARK CURRENT PAGE ──────────────────────────────────────
  async function bookmarkCurrent(context) {
    const rawUrl = window.location.href;
    const clean = await getCleanUrl(rawUrl, context || 'bookmark');
    if (!clean) return;
    const vid = extractVideoId(clean);
    if (!vid) return;
    chrome.runtime.sendMessage({
      type: 'BOOKMARK_CURRENT',
      url: makeCleanUrl(vid, rawUrl),
      title: document.title.replace(/ - YouTube.*$/i, '').replace(/ - YouTube Music.*$/i, '').trim(),
    });
  }

  // ── MESSAGE LISTENER ──────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GET_UPLOADER') {
      sendResponse({ uploader: getUploaderName() });
      return true;
    }
    if (msg.type === 'LIKE_AND_BOOKMARK') {
      triggerLike();
      bookmarkCurrent('like');
    }
    if (msg.type === 'QUICK_DOWNLOAD_TOAST') {
      showToast(msg.msg || '');
    }
  });

  // ── TOAST ──────────────────────────────────────────────────────
  function showToast(msg) {
    let el = document.getElementById('ytbc-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ytbc-toast';
      Object.assign(el.style, {
        position: 'fixed', bottom: '32px', left: '50%',
        transform: 'translateX(-50%) translateY(8px)',
        background: 'rgba(17,17,17,0.95)', color: '#eee',
        fontSize: '12px', fontFamily: 'system-ui,sans-serif',
        padding: '7px 18px', borderRadius: '20px',
        zIndex: '2147483647', pointerEvents: 'none',
        transition: 'opacity .18s, transform .18s',
        opacity: '0', whiteSpace: 'nowrap',
        boxShadow: '0 2px 16px rgba(0,0,0,.5)',
      });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(8px)';
    }, 2400);
  }
})();
