/* cleaner.js — YT Bookmark Cleaner v2.1 */
(() => {
  'use strict';

  // ── URL CLEANER ────────────────────────────────────────────────
  // Returns clean URL string, or null if this page should be ignored
  function getCleanUrl(href) {
    try {
      const u = new URL(href);
      const host = u.hostname;
      if (host !== 'www.youtube.com' && host !== 'music.youtube.com') return null;
      if (u.pathname !== '/watch') return null;
      const vid = u.searchParams.get('v');
      if (!vid) return null;
      return `${u.origin}/watch?v=${vid}`;
    } catch { return null; }
  }

  function cleanCurrentUrl() {
    const clean = getCleanUrl(window.location.href);
    if (!clean || clean === window.location.href) return;
    history.replaceState(null, '', clean);
  }

  cleanCurrentUrl();

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      cleanCurrentUrl();
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
      // Primary XPath (from user-provided path)
      const btn = findByXPath(
        '//*[@id="top-level-buttons-computed"]/segmented-like-dislike-button-view-model/yt-smartimation/div/div/like-button-view-model/toggle-button-view-model/button-view-model/button'
      );
      if (btn) return btn;

      // Fallback selectors
      const fallbacks = [
        'like-button-view-model button',
        'segmented-like-dislike-button-view-model button',
        '#top-level-buttons-computed button[aria-label*="like" i]',
        'ytd-menu-renderer button[aria-label*="like" i]',
      ];
      for (const s of fallbacks) {
        const el = document.querySelector(s);
        if (el) return el;
      }
    }

    if (host === 'music.youtube.com') {
      // Primary XPath (from user-provided path)
      const btn = findByXPath(
        '/html/body/ytmusic-app/ytmusic-app-layout/ytmusic-player-bar/div[2]/div[3]/ytmusic-like-button-renderer/yt-button-shape[2]/button'
      );
      if (btn) return btn;

      // Fallbacks
      const fallbacks = [
        'ytmusic-like-button-renderer #button-shape-like button',
        'ytmusic-like-button-renderer yt-button-shape:nth-child(2) button',
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

  // ── BOOKMARK CURRENT PAGE ──────────────────────────────────────
  function bookmarkCurrent() {
    const clean = getCleanUrl(window.location.href);
    if (!clean) return;
    chrome.runtime.sendMessage({
      type: 'BOOKMARK_CURRENT',
      url: clean,
      title: document.title.replace(/ - YouTube.*$/i, '').replace(/ - YouTube Music.*$/i, '').trim()
    });
  }

  // ── CTRL+D: LIKE + BOOKMARK (prevent default browser bookmark) ─
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      const clean = getCleanUrl(window.location.href);
      if (!clean) return; // not a video page — let browser handle it
      e.preventDefault();
      e.stopImmediatePropagation();
      triggerLike();
      bookmarkCurrent();
      showToast('❤️ Liked + Bookmarked');
    }
  }, true);

  // Relay from background (keyboard shortcut command)
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'AUTO_LIKE') {
      triggerLike();
      bookmarkCurrent();
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
        boxShadow: '0 2px 16px rgba(0,0,0,.5)'
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
