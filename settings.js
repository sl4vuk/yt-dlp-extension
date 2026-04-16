/* settings.js — YT Bookmark Cleaner Settings v2.6 */
'use strict';

const store = {
  get: k => new Promise(r => chrome.storage.local.get(k, r)),
  set: o => new Promise(r => chrome.storage.local.set(o, r)),
};

const $ = id => document.getElementById(id);
const html = document.documentElement;

// Elements
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.settings-section');
const toastEl = $('settings-toast');

// General
const defFolderSel = $('set-default-folder');
const autoSyncToggle = $('set-auto-sync');
const showExportToggle = $('set-show-export');
const themeSelect = $('set-theme');
const interfaceLanguageSelect = $('set-interface-language');
const interfaceLanguageSearch = $('set-interface-language-search');
const downloadPathInput = $('set-download-path');
const browsePathBtn = $('set-browse-path');
const panelModeSelect = $('set-panel-mode');

// Import/Export
const importDropZone = $('import-drop-zone');
const importBrowseBtn = $('import-browse-btn');
const importFileInput = $('import-file-input');
const exportSettingsBtn = $('export-settings-btn');
const resetSettingsBtn = $('reset-settings-btn');

let toastTimer;

function buildLanguageOptions(filter = '') {
  if (!interfaceLanguageSelect || !window.ExtensionI18n) return;
  const selected = interfaceLanguageSelect.value || 'en';
  const query = filter.trim().toLowerCase();
  const languages = window.ExtensionI18n.getLanguageOptions().filter(item => {
    return !query || item.name.toLowerCase().includes(query) || item.code.toLowerCase().includes(query);
  });

  interfaceLanguageSelect.innerHTML = languages.map(item => (
    `<option value="${item.code}">${item.name}</option>`
  )).join('');

  interfaceLanguageSelect.value = languages.some(item => item.code === selected) ? selected : (languages[0]?.code || 'en');
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
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

// ── NAV ─────────────────────────────────────────────────────────
navItems.forEach(item => {
  item.addEventListener('click', () => {
    const sectionId = item.dataset.section;
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    sections.forEach(s => s.classList.toggle('active', s.id === `section-${sectionId}`));
  });
});

// ── THEME ───────────────────────────────────────────────────────
function applyTheme(t) {
  if (t === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', t || 'dark');
  }
}

// Listen for OS theme changes when in system mode
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
  const saved = await store.get(['theme']);
  if (!saved.theme || saved.theme === 'system') applyTheme('system');
});

// ── BOOKMARK FOLDER TREE ────────────────────────────────────────
function buildTree(nodes, selectEl, prefix = '') {
  nodes.forEach(n => {
    if (!n.url) {
      const o = document.createElement('option');
      o.value = n.id;
      o.textContent = (prefix + (n.title || '')) || '(no name)';
      selectEl.appendChild(o);
      if (n.children) buildTree(n.children, selectEl, prefix + '\u2003');
    }
  });
}

// ── DEFAULTS ─────────────────────────────────────────────────────
const DEFAULTS = {
  defaultFolder: '',
  autoSync: false,
  showExport: false,
  quickDownloadEnabled: true,
  downloadPath: '',
  panelMode: 'popup',
  theme: 'system',
  interfaceLanguage: 'en',
  format: 'mp3',
  lastFolder: '',
  downloadMode: 'bookmarks',
  clipboardUrls: '[]',
  downloadCookieMode: 'off',
};

// ── LOAD SETTINGS ───────────────────────────────────────────────
async function loadSettings() {
  const keys = Object.keys(DEFAULTS);
  const saved = await store.get(keys);

  // Bookmark folder tree
  await new Promise(r => chrome.bookmarks.getTree(tree => {
    defFolderSel.innerHTML = '<option value="">— Select —</option>';
    buildTree(tree, defFolderSel);
    r();
  }));

  if (saved.defaultFolder) defFolderSel.value = saved.defaultFolder;
  autoSyncToggle.checked = !!saved.autoSync;
  // showExport default is false
  showExportToggle.checked = saved.showExport === true;

  if (saved.downloadPath) downloadPathInput.value = saved.downloadPath;
  if (saved.panelMode) panelModeSelect.value = saved.panelMode;

  // Theme selector
  const themeVal = saved.theme || 'system';
  if (themeSelect) themeSelect.value = themeVal;
  applyTheme(themeVal);

  if (interfaceLanguageSelect) {
    buildLanguageOptions();
    interfaceLanguageSelect.value = saved.interfaceLanguage || 'en';
  }

  if (window.ExtensionI18n) {
    await window.ExtensionI18n.applyPageTranslations(document, saved.interfaceLanguage || 'en');
  }
}

// ── AUTO-SAVE — instant on every change ─────────────────────────
async function save(key, val) {
  await store.set({ [key]: val });
  toast('✓ Saved');
}

function initBindings() {
  defFolderSel.addEventListener('change', () => save('defaultFolder', defFolderSel.value));
  autoSyncToggle.addEventListener('change', () => save('autoSync', autoSyncToggle.checked));
  showExportToggle.addEventListener('change', () => save('showExport', showExportToggle.checked));

  // Theme dropdown
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      const t = themeSelect.value;
      store.set({ theme: t });
      applyTheme(t);
      toast('✓ Theme: ' + t);
    });
  }

  if (interfaceLanguageSelect) {
    interfaceLanguageSelect.addEventListener('change', async () => {
      await window.ExtensionI18n.setLanguage(interfaceLanguageSelect.value);
      await window.ExtensionI18n.applyPageTranslations(document, interfaceLanguageSelect.value);
      toast('✓ Saved');
    });
  }

  if (interfaceLanguageSearch) {
    interfaceLanguageSearch.addEventListener('input', () => {
      const current = interfaceLanguageSelect.value || 'en';
      buildLanguageOptions(interfaceLanguageSearch.value);
      if (current) interfaceLanguageSelect.value = current;
    });
  }

  // Download path with debounce
  let pathTimer;
  downloadPathInput.addEventListener('input', () => {
    clearTimeout(pathTimer);
    pathTimer = setTimeout(() => save('downloadPath', downloadPathInput.value.trim()), 500);
  });
  downloadPathInput.addEventListener('change', () => save('downloadPath', downloadPathInput.value.trim()));

  // Panel mode — also inform background
  panelModeSelect.addEventListener('change', () => {
    const mode = panelModeSelect.value;
    store.set({ panelMode: mode });
    sendRuntimeMessage({ type: 'SET_PANEL_MODE', mode }).then(res => {
      toast(res?.ok === false ? (res.error || 'Panel mode update failed') : '✓ Panel mode: ' + mode);
    });
  });

  // Browse path
  browsePathBtn.addEventListener('click', async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const name = handle.name;
      const res = await sendRuntimeMessage({ type: 'RESOLVE_PATH', folderName: name });
      if (res?.path) {
        downloadPathInput.value = res.path;
        await store.set({ downloadPath: res.path });
        toast('✓ ' + res.path);
      } else {
        downloadPathInput.value = name;
        await store.set({ downloadPath: name });
        toast(`Folder "${name}" selected`);
      }
    } catch {}
  });
}

// ── LISTEN FOR EXTERNAL STORAGE CHANGES (real-time sync) ────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.theme) {
    applyTheme(changes.theme.newValue);
    if (themeSelect) themeSelect.value = changes.theme.newValue || 'system';
  }
  if (changes.interfaceLanguage && interfaceLanguageSelect)
    interfaceLanguageSelect.value = changes.interfaceLanguage.newValue || 'en';
  if (changes.interfaceLanguage && window.ExtensionI18n)
    window.ExtensionI18n.applyPageTranslations(document, changes.interfaceLanguage.newValue || 'en');
  if (changes.panelMode && panelModeSelect) panelModeSelect.value = changes.panelMode.newValue;
  if (changes.downloadPath && downloadPathInput)
    downloadPathInput.value = changes.downloadPath.newValue || '';
  if (changes.autoSync && autoSyncToggle)
    autoSyncToggle.checked = !!changes.autoSync.newValue;
  if (changes.showExport && showExportToggle)
    showExportToggle.checked = changes.showExport.newValue === true;
  if (changes.defaultFolder && defFolderSel)
    defFolderSel.value = changes.defaultFolder.newValue || '';
});

function openExtensionShortcutsPage() {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
}

$('open-shortcuts-download')?.addEventListener('click', openExtensionShortcutsPage);
$('open-shortcuts-panel')?.addEventListener('click', openExtensionShortcutsPage);

// ── IMPORT / EXPORT ─────────────────────────────────────────────
importBrowseBtn.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', () => {
  if (importFileInput.files.length) importSettingsFile(importFileInput.files[0]);
});

importDropZone.addEventListener('dragover', e => {
  e.preventDefault();
  importDropZone.classList.add('over');
});
importDropZone.addEventListener('dragleave', () => {
  importDropZone.classList.remove('over');
});
importDropZone.addEventListener('drop', e => {
  e.preventDefault();
  importDropZone.classList.remove('over');
  if (e.dataTransfer.files.length) importSettingsFile(e.dataTransfer.files[0]);
});

async function importSettingsFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const toSave = {};
    for (const key of Object.keys(DEFAULTS)) {
      if (key in data) toSave[key] = data[key];
    }
    await store.set(toSave);
    toast('✓ Settings imported');
    setTimeout(() => location.reload(), 500);
  } catch {
    toast('✗ Import failed: invalid JSON');
  }
}

exportSettingsBtn.addEventListener('click', async () => {
  const keys = Object.keys(DEFAULTS);
  const data = await store.get(keys);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ytbookmark_settings.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('✓ Settings exported');
});

resetSettingsBtn.addEventListener('click', async () => {
  if (!confirm('Reset all settings to defaults? This cannot be undone.')) return;
  await store.set({ ...DEFAULTS });
  toast('✓ Settings reset');
  setTimeout(() => location.reload(), 500);
});

// ── INIT ────────────────────────────────────────────────────────
async function init() {
  await loadSettings();
  initBindings();
}

document.addEventListener('DOMContentLoaded', init);
