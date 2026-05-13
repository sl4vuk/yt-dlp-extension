/* settings.js — YT Bookmark Cleaner Settings v2.6 */
'use strict';

// ── STORAGE HELPERS ───────────────────────────────────────────────
const store = {
  get: k => new Promise(r => chrome.storage.local.get(k, r)),
  set: o => new Promise(r => chrome.storage.local.set(o, r)),
};

const $ = id => document.getElementById(id);
const html = document.documentElement;

// ── DEFAULTS ──────────────────────────────────────────────────────
const DEFAULTS = {
  // Appearance / General
  theme: 'system',
  panelMode: 'sidebar',
  // Behavior
  autoSync: false,
  showExport: false,
  clipboardAutoAdd: false,
  startDownloadAutomatically: false,
  removeCompletedAutomatically: false,
  expandPlaylistAutomatically: false,
  // URL Cleaning
  urlCleanTrigger: 'off',
  urlCleanTargets: [],
  // Shortcuts
  downloadShortcutEnabled: true,
  likeShortcutEnabled: true,
  // Download / Output (wired to downloader)
  downloadPath: '',
  format: 'mp3',
  downloadCookieMode: 'none',
  oauthCookiesText: '',
  simultaneousDownloads: 1,
  audioDownloadFolder: '',
  videoDownloadFolder: '',
  useSameOutputPath: true,
  audioOutputFormat: 'mp3',
  audioBitrate: '192',
  audioBitratePreset: '192',
  audioSourceCodec: 'auto',
  audioSampleRate: '',
  videoOriginalQuality: true,
  videoCodecPreference: 'h264',
  videoQualityPreset: 'best',
  videoAudioCodec: 'auto',
  videoAudioBitrate: '192',
  audioFilenameTemplate: '%(title)s',
  videoFilenameTemplate: '%(title)s',
  outputAddNumber: false,
  outputDelimiter: '.',
  outputRemoveEmoji: false,
  outputSkipIfExists: false,
  localRepoPath: '',
};

// ── TOAST ─────────────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const t = $('settings-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ── THEME ─────────────────────────────────────────────────────────
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
let savedTheme = 'system';

function applyTheme(t) {
  savedTheme = t || 'system';
  if (t === 'system') {
    html.setAttribute('data-theme', systemDark.matches ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', t);
  }
}

systemDark.addEventListener('change', () => {
  if (savedTheme === 'system') applyTheme('system');
});

// ── NAV SECTION SWITCHING ─────────────────────────────────────────
function showSection(key) {
  document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = $(`section-${key}`);
  if (sec) sec.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-section="${key}"]`);
  if (nav) nav.classList.add('active');
  // Clear search input when leaving search section
  if (key !== 'search') {
    const inp = $('settings-search-input');
    if (inp && inp.value) inp.value = '';
  }
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    showSection(item.dataset.section);
  });
});

// Start on General
showSection('general');

// ── THEME RADIO ───────────────────────────────────────────────────
function bindThemeRadio(saved) {
  const radios = document.querySelectorAll('input[name="set-theme"]');
  radios.forEach(r => {
    r.checked = r.value === saved;
    r.addEventListener('change', async () => {
      applyTheme(r.value);
      await store.set({ theme: r.value });
      toast('Theme saved');
    });
  });
}

// ── PANEL MODE RADIO ──────────────────────────────────────────────
function bindPanelModeRadio(saved) {
  const radios = document.querySelectorAll('input[name="set-panel-mode"]');
  radios.forEach(r => {
    r.checked = r.value === saved;
    r.addEventListener('change', async () => {
      await store.set({ panelMode: r.value });
      toast('Panel mode saved');
    });
  });
}

// ── SIMPLE TOGGLE ─────────────────────────────────────────────────
function bindToggle(id, storageKey, saved) {
  const el = $(id);
  if (!el) return;
  el.checked = !!saved;
  el.addEventListener('change', async () => {
    await store.set({ [storageKey]: el.checked });
    toast('Saved');
  });
}

// ── SIMPLE SELECT ─────────────────────────────────────────────────
function bindSelect(id, storageKey, saved) {
  const el = $(id);
  if (!el) return;
  el.value = saved || '';
  el.addEventListener('change', async () => {
    await store.set({ [storageKey]: el.value });
    toast('Saved');
  });
}

// ── VR-OPT SINGLE SELECT ─────────────────────────────────────────
function bindVrSingle(groupEl, storageKey, saved) {
  if (!groupEl) return;
  groupEl.querySelectorAll('.vr-opt').forEach(btn => {
    if (btn.dataset.value === saved) btn.classList.add('active');
    btn.addEventListener('click', async () => {
      groupEl.querySelectorAll('.vr-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await store.set({ [storageKey]: btn.dataset.value });
      toast('Saved');
    });
  });
}

// ── URL CLEAN TARGETS (multi-select) ─────────────────────────────
function bindUrlCleanTargets(savedArr) {
  const group = $('url-clean-targets');
  if (!group) return;
  let active = Array.isArray(savedArr) ? [...savedArr] : [];

  function refresh() {
    group.querySelectorAll('.url-clean-target').forEach(btn => {
      const t = btn.dataset.target;
      btn.classList.toggle('active', active.includes(t));
    });
  }
  refresh();

  group.querySelectorAll('.url-clean-target').forEach(btn => {
    btn.addEventListener('click', async () => {
      const t = btn.dataset.target;
      if (t === 'all') {
        active = active.includes('all') ? [] : ['all'];
      } else {
        if (active.includes('all')) active = active.filter(x => x !== 'all');
        if (active.includes(t)) active = active.filter(x => x !== t);
        else active.push(t);
      }
      refresh();
      await store.set({ urlCleanTargets: active });
      toast('Saved');
    });
  });
}

// ── BOOKMARK FOLDER SELECT ────────────────────────────────────────
async function populateFolderSelects(savedDefault, savedLikeFolder) {
  const selects = [
    { el: $('set-default-folder'), key: 'defaultFolder', current: savedDefault },
    { el: $('set-like-shortcut-folder'), key: 'likeShortcutFolder', current: savedLikeFolder },
  ];

  let folders = [];
  try {
    const tree = await new Promise(r => chrome.bookmarks.getTree(r));
    function walk(node) {
      if (!node) return;
      if (!node.url) {
        folders.push({ id: node.id, title: node.title || '(root)', parentTitle: '' });
      }
      (node.children || []).forEach(c => walk(c));
    }
    (tree || []).forEach(walk);
  } catch {}

  selects.forEach(({ el, key, current }) => {
    if (!el) return;
    el.innerHTML = '<option value="">— Any folder —</option>';
    folders.forEach(f => {
      if (f.id === '0') return;
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.title || `Folder ${f.id}`;
      if (f.id === current) opt.selected = true;
      el.appendChild(opt);
    });
    el.addEventListener('change', async () => {
      await store.set({ [key]: el.value });
      toast('Saved');
    });
  });
}

// ── LANGUAGE COMBOBOX ─────────────────────────────────────────────
function initLanguageCombobox(savedLang) {
  const trigger = $('set-interface-language-trigger');
  const panel = $('set-interface-language-panel');
  const valueSpan = $('set-interface-language-value');
  const searchInput = $('set-interface-language-search');
  const optionsContainer = $('set-interface-language-options');

  if (!trigger || !panel) return;

  let languages = [];
  if (window.ExtensionI18n && window.ExtensionI18n.LANGUAGES) {
    languages = window.ExtensionI18n.LANGUAGES;
  } else {
    languages = [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'it', name: 'Italian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'ru', name: 'Russian' },
      { code: 'zh', name: 'Chinese (Simplified)' },
      { code: 'ja', name: 'Japanese' },
      { code: 'ko', name: 'Korean' },
      { code: 'ar', name: 'Arabic' },
      { code: 'hi', name: 'Hindi' },
      { code: 'tr', name: 'Turkish' },
      { code: 'pl', name: 'Polish' },
      { code: 'nl', name: 'Dutch' },
    ];
  }

  let currentLang = savedLang || 'en';

  function getDisplayName(code) {
    const found = languages.find(l => (l.code || l) === code);
    return found ? (found.name || found) : code;
  }

  function renderOptions(filter) {
    optionsContainer.innerHTML = '';
    const q = (filter || '').toLowerCase();
    const filtered = q
      ? languages.filter(l => {
          const name = (l.name || l).toLowerCase();
          const code = (l.code || l).toLowerCase();
          return name.includes(q) || code.includes(q);
        })
      : languages;
    filtered.forEach(lang => {
      const code = lang.code || lang;
      const name = lang.name || lang;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'language-option' + (code === currentLang ? ' active' : '');
      btn.textContent = name;
      btn.addEventListener('click', async () => {
        currentLang = code;
        valueSpan.textContent = name;
        panel.hidden = true;
        optionsContainer.querySelectorAll('.language-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        await store.set({ interfaceLanguage: code });
        toast('Language saved');
        if (window.ExtensionI18n) {
          await window.ExtensionI18n.applyPageTranslations(document, code);
        }
      });
      optionsContainer.appendChild(btn);
    });
  }

  valueSpan.textContent = getDisplayName(currentLang);
  renderOptions('');

  trigger.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      searchInput.value = '';
      renderOptions('');
      searchInput.focus();
    }
  });

  searchInput.addEventListener('input', () => renderOptions(searchInput.value));

  document.addEventListener('click', e => {
    const combobox = $('language-combobox');
    if (combobox && !combobox.contains(e.target)) {
      panel.hidden = true;
    }
  });
}

// ── OAUTH ─────────────────────────────────────────────────────────
function setOAuthStatus(msg) {
  const el = $('oauth-status');
  if (el) el.textContent = msg;
}

function initOAuth(savedCookieMode, savedCookiesText) {
  const googleBtn = $('oauth-google-btn');
  const anonBtn = $('oauth-anonymous-btn');
  const cookiesText = $('oauth-cookies-text');

  if (cookiesText) {
    cookiesText.value = savedCookiesText || '';
    setOAuthStatus(savedCookiesText ? 'Cookies available for restricted downloads.' : 'No cookies captured yet.');
    cookiesText.addEventListener('input', async () => {
      await store.set({ oauthCookiesText: cookiesText.value });
    });
  }

  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      setOAuthStatus('Capturing cookies from browser…');
      try {
        const resp = await new Promise(r =>
          chrome.runtime.sendMessage({ type: 'CAPTURE_COOKIES' }, r)
        );
        if (resp?.ok && resp.cookieText) {
          if (cookiesText) cookiesText.value = resp.cookieText;
          await store.set({ oauthCookiesText: resp.cookieText, downloadCookieMode: 'cookies' });
          setOAuthStatus('Cookies captured from Chrome profile.');
          toast('Cookies captured');
        } else {
          setOAuthStatus(resp?.error || 'Failed to capture cookies.');
          toast('Cookie capture failed');
        }
      } catch {
        setOAuthStatus('Error communicating with background.');
        toast('Error');
      }
    });
  }

  if (anonBtn) {
    anonBtn.addEventListener('click', async () => {
      setOAuthStatus('Capturing cookies from YouTube tab…');
      try {
        const resp = await new Promise(r =>
          chrome.runtime.sendMessage({ type: 'CAPTURE_COOKIES_ANONYMOUS' }, r)
        );
        if (resp?.ok && resp.cookieText) {
          if (cookiesText) cookiesText.value = resp.cookieText;
          await store.set({ oauthCookiesText: resp.cookieText, downloadCookieMode: 'cookies' });
          setOAuthStatus('Anonymous cookies captured.');
          toast('Cookies captured');
        } else {
          setOAuthStatus(resp?.error || 'No YouTube session found. Open YouTube first.');
          toast('No YouTube session');
        }
      } catch {
        setOAuthStatus('Error capturing anonymous cookies.');
        toast('Error');
      }
    });
  }
}

// ── SHORTCUTS ─────────────────────────────────────────────────────
function initShortcuts(saved) {
  bindToggle('set-download-shortcut-enabled', 'downloadShortcutEnabled', saved.downloadShortcutEnabled !== false);
  bindToggle('set-like-shortcut-enabled', 'likeShortcutEnabled', saved.likeShortcutEnabled !== false);

  ['open-shortcuts-download', 'open-shortcuts-panel', 'open-shortcuts-like'].forEach(id => {
    const btn = $(id);
    if (btn) {
      btn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
      });
    }
  });
}

// ── IMPORT / EXPORT ───────────────────────────────────────────────
function initImportExport() {
  // Export
  const exportBtn = $('export-settings-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const all = await store.get(null);
      const json = JSON.stringify(all, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'yt-bookmark-cleaner-settings.json';
      a.click();
      URL.revokeObjectURL(url);
      toast('Settings exported');
    });
  }

  // Import
  const browseBtn = $('import-browse-btn');
  const fileInput = $('import-file-input');
  const dropZone = $('import-drop-zone');

  function importFile(file) {
    if (!file || !file.name.endsWith('.json')) {
      toast('Please select a .json file');
      return;
    }
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const parsed = JSON.parse(e.target.result);
        await store.set(parsed);
        toast('Settings imported — reloading…');
        setTimeout(() => location.reload(), 900);
      } catch {
        toast('Invalid settings file');
      }
    };
    reader.readAsText(file);
  }

  if (browseBtn && fileInput) {
    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) importFile(fileInput.files[0]);
      fileInput.value = '';
    });
  }

  if (dropZone) {
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('over');
      const file = e.dataTransfer?.files?.[0];
      if (file) importFile(file);
    });
  }

  // Reset
  const resetBtn = $('reset-settings-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!confirm('Reset all settings to defaults? This cannot be undone.')) return;
      await new Promise(r => chrome.storage.local.clear(r));
      toast('Settings reset — reloading…');
      setTimeout(() => location.reload(), 900);
    });
  }
}

// ── OUTPUT MODE SWITCH (Audio / Video) ────────────────────────────
function initOutputModeSwitch() {
  const btns = document.querySelectorAll('.output-mode-btn');
  const panels = {
    audio: $('output-audio-settings'),
    video: $('output-video-settings'),
  };

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.outputMode;
      Object.entries(panels).forEach(([k, p]) => {
        if (p) p.classList.toggle('active', k === mode);
      });
    });
  });
}

// ── DOWNLOAD SECTION (dynamic) ────────────────────────────────────
function renderDownloadSettings(saved) {
  const container = $('download-settings-container');
  if (!container) return;

  container.innerHTML = `
    <details class="settings-accordion" open>
      <summary class="accordion-summary">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
        <div class="accordion-info"><span class="accordion-title">Folders</span><span class="accordion-hint">Where downloaded files are saved.</span></div>
        <svg class="accordion-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </summary>
      <div class="accordion-body">
        <div class="settings-card">
          <div class="setting-row">
            <div class="setting-info"><div class="setting-label">Audio download folder</div><div class="setting-hint">Full path where audio files are saved.</div></div>
            <div class="setting-inline-control">
              <input type="text" id="dl-audio-folder" class="setting-input" placeholder="e.g. C:\\Users\\You\\Music" value="${escHtml(saved.audioDownloadFolder || saved.downloadPath || '')}"/>
            </div>
          </div>
        </div>
        <div class="settings-card">
          <div class="setting-row">
            <div class="setting-info"><div class="setting-label">Video download folder</div><div class="setting-hint">Full path where video files are saved.</div></div>
            <div class="setting-inline-control">
              <input type="text" id="dl-video-folder" class="setting-input" placeholder="e.g. C:\\Users\\You\\Videos" value="${escHtml(saved.videoDownloadFolder || '')}"/>
            </div>
          </div>
        </div>
      </div>
    </details>

    <details class="settings-accordion">
      <summary class="accordion-summary">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <div class="accordion-info"><span class="accordion-title">Performance</span><span class="accordion-hint">Concurrency and speed options.</span></div>
        <svg class="accordion-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </summary>
      <div class="accordion-body">
        <div class="settings-card">
          <div class="setting-row">
            <div class="setting-info"><div class="setting-label">Simultaneous downloads</div><div class="setting-hint">How many files download at the same time (1–10).</div></div>
            <div class="setting-inline-control">
              <input type="number" id="dl-simultaneous" class="setting-input" min="1" max="10" style="width:70px" value="${Number(saved.simultaneousDownloads) || 1}"/>
            </div>
          </div>
        </div>
      </div>
    </details>

    <details class="settings-accordion">
      <summary class="accordion-summary">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <div class="accordion-info"><span class="accordion-title">Network / Proxy</span><span class="accordion-hint">Proxy settings for restricted networks.</span></div>
        <svg class="accordion-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </summary>
      <div class="accordion-body">
        <div class="settings-card">
          <div class="setting-row">
            <div class="setting-info"><div class="setting-label">Proxy type</div></div>
            <select id="dl-proxy-type" class="setting-select">
              <option value="">None</option>
              <option value="http">HTTP</option>
              <option value="socks5">SOCKS5</option>
            </select>
          </div>
        </div>
        <div class="settings-card">
          <div class="setting-row">
            <div class="setting-info"><div class="setting-label">Proxy address</div><div class="setting-hint">Host or IP for the proxy server.</div></div>
            <div class="setting-inline-control">
              <input type="text" id="dl-proxy-address" class="setting-input" placeholder="127.0.0.1" value="${escHtml(saved.proxyAddress || '')}"/>
            </div>
          </div>
        </div>
        <div class="settings-card">
          <div class="setting-row">
            <div class="setting-info"><div class="setting-label">Proxy port</div></div>
            <div class="setting-inline-control">
              <input type="number" id="dl-proxy-port" class="setting-input" style="width:90px" placeholder="8080" value="${escHtml(saved.proxyPort || '')}"/>
            </div>
          </div>
        </div>
      </div>
    </details>
  `;

  // Bind inputs
  function bindText(id, key, debounce = 600) {
    const el = $(id);
    if (!el) return;
    let timer;
    el.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const val = el.value.trim();
        const obj = { [key]: val };
        // Mirror audio folder to legacy downloadPath
        if (key === 'audioDownloadFolder') obj.downloadPath = val;
        await store.set(obj);
        toast('Saved');
      }, debounce);
    });
  }

  bindText('dl-audio-folder', 'audioDownloadFolder');
  bindText('dl-video-folder', 'videoDownloadFolder');
  bindText('dl-proxy-address', 'proxyAddress');
  bindText('dl-proxy-port', 'proxyPort');

  const simEl = $('dl-simultaneous');
  if (simEl) {
    let simTimer;
    simEl.addEventListener('input', () => {
      clearTimeout(simTimer);
      simTimer = setTimeout(async () => {
        const v = Math.max(1, Math.min(10, parseInt(simEl.value) || 1));
        simEl.value = v;
        await store.set({ simultaneousDownloads: v });
        toast('Saved');
      }, 600);
    });
  }

  const proxyTypeEl = $('dl-proxy-type');
  if (proxyTypeEl) {
    proxyTypeEl.value = saved.proxyType || '';
    proxyTypeEl.addEventListener('change', async () => {
      await store.set({ proxyType: proxyTypeEl.value });
      toast('Saved');
    });
  }
}

// ── OUTPUT SECTION (dynamic) ──────────────────────────────────────

function vrPills(id, opts, saved, storageKey, extraSave) {
  const el = $(id);
  if (!el) return;
  let current = saved;
  el.querySelectorAll('.vr-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === current);
    btn.addEventListener('click', async () => {
      current = btn.dataset.value;
      el.querySelectorAll('.vr-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const obj = { [storageKey]: current };
      if (extraSave) Object.assign(obj, extraSave(current));
      await store.set(obj);
      toast('Saved');
    });
  });
}

function pillsHtml(id, opts, current) {
  const btns = opts.map(o =>
    `<button type="button" class="vr-opt${o.value === current ? ' active' : ''}" data-value="${escHtml(o.value)}">${escHtml(o.label)}</button>`
  ).join('');
  return `<div class="vr-group" id="${id}">${btns}</div>`;
}

function renderOutputSettings(saved) {
  const common = $('output-common-settings');
  if (common) {
    common.innerHTML = `
      <div class="settings-card">
        <div class="setting-row">
          <div class="setting-info"><div class="setting-label">Add track number prefix</div><div class="setting-hint">Prepend a sequential number to filenames.</div></div>
          <label class="toggle-switch"><input type="checkbox" id="out-add-number" ${saved.outputAddNumber ? 'checked' : ''}/><span class="toggle-slider"></span></label>
        </div>
      </div>
      <div class="settings-card">
        <div class="setting-row">
          <div class="setting-info"><div class="setting-label">Remove emoji from filename</div></div>
          <label class="toggle-switch"><input type="checkbox" id="out-remove-emoji" ${saved.outputRemoveEmoji ? 'checked' : ''}/><span class="toggle-slider"></span></label>
        </div>
      </div>
      <div class="settings-card">
        <div class="setting-row">
          <div class="setting-info"><div class="setting-label">Skip if file already exists</div></div>
          <label class="toggle-switch"><input type="checkbox" id="out-skip-exists" ${saved.outputSkipIfExists ? 'checked' : ''}/><span class="toggle-slider"></span></label>
        </div>
      </div>
    `;
    bindToggle('out-add-number', 'outputAddNumber', saved.outputAddNumber);
    bindToggle('out-remove-emoji', 'outputRemoveEmoji', saved.outputRemoveEmoji);
    bindToggle('out-skip-exists', 'outputSkipIfExists', saved.outputSkipIfExists);
  }

  const audio = $('output-audio-settings');
  if (audio) {
    const audioSourceCodec  = saved.audioSourceCodec  || 'auto';
    const audioOutputFormat = saved.audioOutputFormat || 'mp3';
    const audioBitratePreset= saved.audioBitratePreset|| '192';

    audio.innerHTML = `
      <div class="settings-card">
        <div class="setting-row">
          <div class="setting-info"><div class="setting-label">Filename template</div><div class="setting-hint">yt-dlp output template. %(title)s, %(uploader)s, %(id)s etc.</div></div>
          <div class="setting-inline-control">
            <input type="text" id="out-audio-template" class="setting-input" placeholder="%(title)s" value="${escHtml(saved.audioFilenameTemplate || '%(title)s')}"/>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <div class="setting-info" style="margin-bottom:10px">
          <div class="setting-label">Source audio codec</div>
          <div class="setting-hint">Which codec YouTube stream to pull before conversion. Opus is higher quality at same bitrate; M4A (AAC) has widest device support.</div>
        </div>
        ${pillsHtml('out-audio-source-codec', [
          { value: 'auto',  label: 'Auto (best)' },
          { value: 'opus',  label: 'Opus' },
          { value: 'm4a',   label: 'M4A / AAC' },
        ], audioSourceCodec)}
      </div>

      <div class="settings-card">
        <div class="setting-info" style="margin-bottom:10px">
          <div class="setting-label">Convert to</div>
          <div class="setting-hint">Output container/codec after download. MP3 works everywhere. OGG/WAV are lossless-friendly. Keep original skips re-encoding.</div>
        </div>
        ${pillsHtml('out-audio-format-pills', [
          { value: 'mp3',  label: 'MP3' },
          { value: 'ogg',  label: 'OGG' },
          { value: 'wav',  label: 'WAV' },
          { value: 'm4a',  label: 'M4A (keep)' },
          { value: 'opus', label: 'Opus (keep)' },
        ], audioOutputFormat)}
      </div>

      <div class="settings-card">
        <div class="setting-info" style="margin-bottom:10px">
          <div class="setting-label">Audio quality</div>
          <div class="setting-hint">Target bitrate. 192 kbps is the default — transparent for most music. 128 kbps saves space. 64/32 kbps for voice or very slow connections.</div>
        </div>
        ${pillsHtml('out-audio-bitrate-pills', [
          { value: 'best', label: 'Best' },
          { value: '320',  label: '320 kbps' },
          { value: '192',  label: '192 kbps' },
          { value: '128',  label: '128 kbps' },
          { value: '64',   label: '64 kbps' },
          { value: '32',   label: '32 kbps' },
        ], audioBitratePreset)}
      </div>

      <div class="settings-card">
        <div class="setting-row">
          <div class="setting-info"><div class="setting-label">Sample rate (Hz)</div><div class="setting-hint">44100 Hz is CD quality and works on all devices. Leave blank to keep original.</div></div>
          <div class="setting-inline-control">
            <input type="number" id="out-audio-samplerate" class="setting-input" style="width:100px" placeholder="44100" value="${escHtml(saved.audioSampleRate || '')}"/>
            <span class="setting-inline-suffix">Hz</span>
          </div>
        </div>
      </div>
    `;

    vrPills('out-audio-source-codec', [], audioSourceCodec, 'audioSourceCodec');
    vrPills('out-audio-format-pills', [], audioOutputFormat, 'audioOutputFormat', v => ({ format: v }));
    vrPills('out-audio-bitrate-pills', [], audioBitratePreset, 'audioBitratePreset', v => ({
      audioBitrate: v === 'best' ? '0' : v,
    }));

    const tplEl = $('out-audio-template');
    if (tplEl) {
      let t;
      tplEl.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => { await store.set({ audioFilenameTemplate: tplEl.value.trim() }); toast('Saved'); }, 600);
      });
    }
    const srEl = $('out-audio-samplerate');
    if (srEl) {
      let t;
      srEl.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => { await store.set({ audioSampleRate: srEl.value.trim() }); toast('Saved'); }, 600);
      });
    }
  }

  const video = $('output-video-settings');
  if (video) {
    const videoCodec       = saved.videoCodecPreference || 'h264';
    const videoQuality     = saved.videoQualityPreset   || 'best';
    const videoAudioCodec  = saved.videoAudioCodec      || 'auto';
    const videoAudioBitrate= saved.videoAudioBitrate    || '192';

    video.innerHTML = `
      <div class="settings-card">
        <div class="setting-row">
          <div class="setting-info"><div class="setting-label">Filename template</div><div class="setting-hint">yt-dlp output template for video files.</div></div>
          <div class="setting-inline-control">
            <input type="text" id="out-video-template" class="setting-input" placeholder="%(title)s" value="${escHtml(saved.videoFilenameTemplate || '%(title)s')}"/>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <div class="setting-info" style="margin-bottom:10px">
          <div class="setting-label">Video codec</div>
          <div class="setting-hint">H.264 (legacy) plays on everything including car displays, TVs, and old phones. AV1/VP9/H.265 give better quality at smaller file sizes but need modern hardware.</div>
        </div>
        ${pillsHtml('out-video-codec-pills', [
          { value: 'h264', label: 'H.264 (legacy)' },
          { value: 'vp9',  label: 'VP9' },
          { value: 'h265', label: 'H.265 / HEVC' },
          { value: 'av1',  label: 'AV1' },
        ], videoCodec)}
      </div>

      <div class="settings-card">
        <div class="setting-info" style="margin-bottom:10px">
          <div class="setting-label">Video quality</div>
          <div class="setting-hint">Maximum resolution to download. "Best" picks the highest available. Lower values save space and bandwidth.</div>
        </div>
        ${pillsHtml('out-video-quality-pills', [
          { value: 'best', label: 'Best' },
          { value: '2160', label: '4K' },
          { value: '1440', label: '1440p' },
          { value: '1080', label: '1080p' },
          { value: '720',  label: '720p' },
          { value: '480',  label: '480p' },
          { value: '360',  label: '360p' },
          { value: 'worst',label: 'Lowest' },
        ], videoQuality)}
      </div>

      <div class="settings-card">
        <div class="setting-info" style="margin-bottom:10px">
          <div class="setting-label">Audio track codec</div>
          <div class="setting-hint">Audio stream inside the video file. M4A/AAC is the safest for car stereos and older players. Opus saves space.</div>
        </div>
        ${pillsHtml('out-video-audio-codec-pills', [
          { value: 'auto', label: 'Auto' },
          { value: 'm4a',  label: 'M4A / AAC' },
          { value: 'opus', label: 'Opus' },
        ], videoAudioCodec)}
      </div>

      <div class="settings-card">
        <div class="setting-info" style="margin-bottom:10px">
          <div class="setting-label">Audio track quality</div>
          <div class="setting-hint">Bitrate of the audio stream in the video. 192 kbps is recommended for music videos.</div>
        </div>
        ${pillsHtml('out-video-audio-bitrate-pills', [
          { value: 'best', label: 'Best' },
          { value: '192',  label: '192 kbps' },
          { value: '128',  label: '128 kbps' },
          { value: '64',   label: '64 kbps' },
          { value: '32',   label: '32 kbps' },
        ], videoAudioBitrate)}
      </div>
    `;

    vrPills('out-video-codec-pills',         [], videoCodec,        'videoCodecPreference');
    vrPills('out-video-quality-pills',        [], videoQuality,      'videoQualityPreset');
    vrPills('out-video-audio-codec-pills',    [], videoAudioCodec,   'videoAudioCodec');
    vrPills('out-video-audio-bitrate-pills',  [], videoAudioBitrate, 'videoAudioBitrate');

    const tplEl = $('out-video-template');
    if (tplEl) {
      let t;
      tplEl.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => { await store.set({ videoFilenameTemplate: tplEl.value.trim() }); toast('Saved'); }, 600);
      });
    }
  }
}

// ── GENERAL EXTRA SETTINGS (behavior toggles) ─────────────────────
function renderGeneralExtra(saved) {
  const container = $('general-extra-settings');
  if (!container) return;

  const items = [
    { id: 'gen-clipboard-auto', key: 'clipboardAutoAdd', label: 'Add links from the clipboard automatically', hint: 'YouTube URLs copied to clipboard are added to the Clipboard list automatically.' },
    { id: 'gen-start-auto', key: 'startDownloadAutomatically', label: 'Start download automatically', hint: 'Begin downloading as soon as items are added to the queue.' },
    { id: 'gen-remove-auto', key: 'removeCompletedAutomatically', label: 'Remove completed automatically', hint: 'Completed downloads are removed from the clipboard list.' },
    { id: 'gen-expand-playlist', key: 'expandPlaylistAutomatically', label: 'Expand playlist automatically', hint: 'Automatically expand playlist items when detected.' },
  ];

  container.innerHTML = items.map(it => `
    <div class="settings-card" id="setting-card-${it.id}">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">${escHtml(it.label)}</div>
          <div class="setting-hint">${escHtml(it.hint)}</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="${it.id}" ${saved[it.key] ? 'checked' : ''}/>
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  `).join('');

  items.forEach(it => bindToggle(it.id, it.key, saved[it.key]));
}


// ── LOCAL UPDATE ─────────────────────────────────────────────────
function formatLocalUpdateResult(result) {
  if (!result) return 'No response from native host.';
  const lines = [];
  lines.push(result.ok ? 'OK' : 'ERROR');
  if (result.mode) lines.push(`Mode: ${result.mode}`);
  if (result.repoPath) lines.push(`Repo: ${result.repoPath}`);
  if (result.branch) lines.push(`Branch: ${result.branch}`);
  if (result.before) lines.push(`Before: ${result.before}`);
  if (result.after) lines.push(`After: ${result.after}`);
  if (result.version) lines.push(`Manifest version: ${result.version}`);
  if (result.remote) lines.push(`Remote: ${result.remote}`);
  if (result.remoteIsLocal === false) lines.push('Remote check: blocked because remote is not local.');
  if (Array.isArray(result.changedFiles) && result.changedFiles.length) {
    lines.push('Changed files:');
    result.changedFiles.slice(0, 40).forEach(f => lines.push(`  ${f}`));
    if (result.changedFiles.length > 40) lines.push(`  ...and ${result.changedFiles.length - 40} more`);
  }
  if (result.stdout) lines.push(`Output:\n${result.stdout}`);
  if (result.stderr) lines.push(`Errors:\n${result.stderr}`);
  if (result.error) lines.push(`Error: ${result.error}`);
  if (result.ok && result.mode === 'pull') lines.push('Reload the extension to use the updated files.');
  return lines.join('\n');
}

function initLocalUpdate(saved) {
  const repoInput = $('set-local-repo-path');
  const statusEl = $('local-update-status');
  const checkBtn = $('local-update-check-btn');
  const applyBtn = $('local-update-apply-btn');
  const reloadBtn = $('local-update-reload-btn');
  if (!repoInput || !statusEl) return;

  repoInput.value = saved.localRepoPath || '';
  repoInput.addEventListener('input', async () => {
    await store.set({ localRepoPath: repoInput.value.trim() });
  });

  async function run(type) {
    const repoPath = repoInput.value.trim();
    statusEl.textContent = 'Running...';
    try {
      const result = await new Promise(resolve => chrome.runtime.sendMessage({ type, repoPath }, resolve));
      statusEl.textContent = formatLocalUpdateResult(result);
      toast(result?.ok ? 'Done' : 'Local update failed');
    } catch (e) {
      statusEl.textContent = `Error: ${e?.message || e}`;
      toast('Local update failed');
    }
  }

  checkBtn?.addEventListener('click', () => run('LOCAL_UPDATE_STATUS'));
  applyBtn?.addEventListener('click', () => run('LOCAL_UPDATE_APPLY'));
  reloadBtn?.addEventListener('click', async () => {
    statusEl.textContent = 'Reloading extension...';
    chrome.runtime.sendMessage({ type: 'LOCAL_RELOAD_EXTENSION' }, () => {});
  });
}

// ── ABOUT SECTION ─────────────────────────────────────────────────
function renderAboutExtra() {
  const container = $('about-extra-settings');
  if (!container) return;

  const manifest = chrome.runtime.getManifest();
  const versionEl = $('about-version');
  if (versionEl) versionEl.textContent = `Version ${manifest.version}`;
  const navVer = $('nav-version');
  if (navVer) navVer.textContent = `v${manifest.version}`;
}

// ── SETTINGS SEARCH ───────────────────────────────────────────────
const SEARCH_INDEX = [
  // General / Appearance
  { key: 'set-theme', title: 'Theme', category: 'General', section: 'general', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' },
  { key: 'set-panel-mode', title: 'Panel Mode', category: 'General', section: 'general', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>' },
  { key: 'set-interface-language-trigger', title: 'Interface Language', category: 'General', section: 'general', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' },
  { key: 'set-local-repo-path', title: 'Local repository path', category: 'Local Update', section: 'local-update', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>' },
  { key: 'set-auto-sync', title: 'Auto Sync & Clean', category: 'General', section: 'general', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>' },
  { key: 'set-show-export', title: 'Show Export Section', category: 'General', section: 'general', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' },
  { key: 'gen-clipboard-auto', title: 'Add links from clipboard automatically', category: 'General', section: 'general', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>' },
  { key: 'gen-start-auto', title: 'Start download automatically', category: 'General', section: 'general', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>' },
  { key: 'gen-remove-auto', title: 'Remove completed automatically', category: 'General', section: 'general', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' },
  { key: 'set-default-folder', title: 'Default Bookmark Folder', category: 'General', section: 'general', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' },
  { key: 'oauth-google-btn', title: 'OAuth / Cookies', category: 'General', section: 'general', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
  { key: 'urlCleanTrigger', title: 'Auto URL Cleaning', category: 'General', section: 'general', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>' },
  // Download
  { key: 'dl-audio-folder', title: 'Audio download folder', category: 'Download', section: 'download', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' },
  { key: 'dl-video-folder', title: 'Video download folder', category: 'Download', section: 'download', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' },
  { key: 'dl-simultaneous', title: 'Simultaneous downloads', category: 'Download', section: 'download', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' },
  { key: 'dl-proxy-type', title: 'Proxy type', category: 'Download', section: 'download', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>' },
  // Output
  { key: 'out-audio-format', title: 'Audio format', category: 'Output', section: 'output', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' },
  { key: 'out-audio-bitrate', title: 'Audio bitrate', category: 'Output', section: 'output', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' },
  { key: 'out-audio-template', title: 'Audio filename template', category: 'Output', section: 'output', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
  { key: 'out-add-number', title: 'Add track number prefix', category: 'Output', section: 'output', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>' },
  { key: 'out-skip-exists', title: 'Skip if file already exists', category: 'Output', section: 'output', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' },
  // Shortcuts
  { key: 'set-download-shortcut-enabled', title: 'Download shortcut (Alt+F)', category: 'Shortcuts', section: 'shortcuts', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/></svg>' },
  { key: 'set-like-shortcut-enabled', title: 'Like & Bookmark shortcut (Alt+W)', category: 'Shortcuts', section: 'shortcuts', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/></svg>' },
];

function initSearch() {
  const input = $('settings-search-input');
  const results = $('settings-search-results');
  const catFilter = $('search-cat-filter');
  if (!input || !results) return;

  const categories = [...new Set(SEARCH_INDEX.map(i => i.category))];
  let activeCat = null;

  // Render category pills
  if (catFilter) {
    catFilter.innerHTML = categories.map(c => `
      <button type="button" class="cat-btn" data-cat="${escHtml(c)}">${escHtml(c)}</button>
    `).join('');
    catFilter.querySelectorAll('.cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (activeCat === btn.dataset.cat) {
          activeCat = null;
          btn.classList.remove('active');
        } else {
          catFilter.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
          activeCat = btn.dataset.cat;
          btn.classList.add('active');
        }
        renderResults(input.value);
      });
    });
  }

  function renderResults(q) {
    const query = (q || '').toLowerCase().trim();
    if (!query && !activeCat) {
      results.innerHTML = '';
      return;
    }
    let filtered = SEARCH_INDEX;
    if (activeCat) filtered = filtered.filter(i => i.category === activeCat);
    if (query) filtered = filtered.filter(i =>
      i.title.toLowerCase().includes(query) ||
      i.category.toLowerCase().includes(query)
    );

    if (!filtered.length) {
      results.innerHTML = `<div class="search-empty-state">No settings found for "${escHtml(q)}".</div>`;
      return;
    }

    results.innerHTML = filtered.map(item => `
      <button type="button" class="search-result-item" data-section="${escHtml(item.section)}" data-key="${escHtml(item.key)}">
        <span class="search-result-icon">${item.icon}</span>
        <span class="search-result-copy">
          <span class="search-result-title">${escHtml(item.title)}</span>
          <span class="search-result-category">${escHtml(item.category)}</span>
        </span>
      </button>
    `).join('');

    results.querySelectorAll('.search-result-item').forEach(btn => {
      btn.addEventListener('click', () => {
        showSection(btn.dataset.section);
        const target = $(btn.dataset.key) || document.querySelector(`[data-setting-key="${btn.dataset.key}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (typeof target.focus === 'function') target.focus();
          target.classList.add('search-highlight');
          setTimeout(() => target.classList.remove('search-highlight'), 1400);
        }
      });
    });
  }

  input.addEventListener('input', () => renderResults(input.value));
}

// ── ESCAPE HTML ───────────────────────────────────────────────────
function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── MAIN INIT ─────────────────────────────────────────────────────
async function init() {
  const keys = [
    'theme', 'panelMode', 'autoSync', 'showExport', 'defaultFolder',
    'likeShortcutFolder', 'urlCleanTrigger', 'urlCleanTargets',
    'downloadShortcutEnabled', 'likeShortcutEnabled',
    'downloadCookieMode', 'oauthCookiesText',
    'interfaceLanguage',
    'downloadPath', 'format', 'audioDownloadFolder', 'videoDownloadFolder',
    'simultaneousDownloads', 'proxyType', 'proxyAddress', 'proxyPort',
    'audioOutputFormat', 'audioBitrate', 'audioSampleRate',
    'audioFilenameTemplate', 'videoFilenameTemplate',
    'outputAddNumber', 'outputRemoveEmoji', 'outputSkipIfExists',
    'videoOriginalQuality', 'useSameOutputPath',
    'audioSourceCodec', 'audioBitratePreset',
    'videoCodecPreference', 'videoQualityPreset', 'videoAudioCodec', 'videoAudioBitrate',
    'clipboardAutoAdd', 'startDownloadAutomatically',
    'removeCompletedAutomatically', 'expandPlaylistAutomatically',
  ];

  const saved = { ...DEFAULTS, ...(await store.get(keys)) };

  // Theme
  applyTheme(saved.theme);
  bindThemeRadio(saved.theme);

  // Panel mode
  bindPanelModeRadio(saved.panelMode || 'sidebar');

  // Behavior toggles
  bindToggle('set-auto-sync', 'autoSync', saved.autoSync);
  bindToggle('set-show-export', 'showExport', saved.showExport);

  // General extra toggles
  renderGeneralExtra(saved);

  // URL Cleaning
  bindVrSingle(document.querySelector('[data-vr-key="urlCleanTrigger"]'), 'urlCleanTrigger', saved.urlCleanTrigger || 'off');
  bindUrlCleanTargets(saved.urlCleanTargets);

  // Bookmark folders
  await populateFolderSelects(saved.defaultFolder, saved.likeShortcutFolder);

  // Language
  initLanguageCombobox(saved.interfaceLanguage || 'en');

  // OAuth
  initOAuth(saved.downloadCookieMode, saved.oauthCookiesText);

  // Shortcuts
  initShortcuts(saved);

  // Download section
  renderDownloadSettings(saved);

  // Output section
  initOutputModeSwitch();
  renderOutputSettings(saved);

  // About
  renderAboutExtra();

  // Search
  initSearch();

  // Import/Export
  initImportExport();

  // Language translation
  if (window.ExtensionI18n) {
    const lang = saved.interfaceLanguage || 'en';
    await window.ExtensionI18n.applyPageTranslations(document, lang);
  }
}

document.addEventListener('DOMContentLoaded', init);
