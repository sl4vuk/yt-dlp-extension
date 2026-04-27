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
const interfaceLanguageTrigger = $('set-interface-language-trigger');
const interfaceLanguageValue = $('set-interface-language-value');
const interfaceLanguagePanel = $('set-interface-language-panel');
const interfaceLanguageSearch = $('set-interface-language-search');
const interfaceLanguageOptions = $('set-interface-language-options');
const downloadPathInput = $('set-download-path');
const browsePathBtn = $('set-browse-path');
const oauthGoogleBtn = $('oauth-google-btn');
const oauthAnonymousBtn = $('oauth-anonymous-btn');
const oauthCookiesText = $('oauth-cookies-text');
const oauthStatus = $('oauth-status');
const generalExtraSettings = $('general-extra-settings');
const downloadSettingsContainer = $('download-settings-container');
const outputCommonSettings = $('output-common-settings');
const outputAudioSettings = $('output-audio-settings');
const outputVideoSettings = $('output-video-settings');
const outputModeSwitch = $('output-mode-switch');
const aboutExtraSettings = $('about-extra-settings');
const settingsSearchInput = $('settings-search-input');
const settingsSearchClear = $('settings-search-clear');
const settingsSearchResults = $('settings-search-results');

// Import/Export
const importDropZone = $('import-drop-zone');
const importBrowseBtn = $('import-browse-btn');
const importFileInput = $('import-file-input');
const exportSettingsBtn = $('export-settings-btn');
const resetSettingsBtn = $('reset-settings-btn');

let toastTimer;
let currentInterfaceLanguage = 'en';
let settingsSearchIndex = [];
let searchCategoryFilter = 'all';
const dynamicInputTimers = new Map();

// ── RADIO HELPERS (replaces select for theme / panel-mode) ───────
function setRadioValue(name, value) {
  document.querySelectorAll(`input[name="${name}"]`).forEach(r => {
    r.checked = r.value === value;
  });
}
function getRadioValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value ?? null;
}

function buildLanguageOptions(filter = '') {
  if (!interfaceLanguageOptions || !window.ExtensionI18n) return;
  const query = filter.trim().toLowerCase();
  const languages = window.ExtensionI18n.getLanguageOptions().filter(item => {
    return !query || item.name.toLowerCase().includes(query) || item.code.toLowerCase().includes(query);
  });

  interfaceLanguageOptions.innerHTML = languages.map(item => (
    `<button type="button" class="language-option${item.code === currentInterfaceLanguage ? ' active' : ''}" data-language-code="${item.code}">${item.name}</button>`
  )).join('');
  const current = window.ExtensionI18n.getLanguageOptions().find(item => item.code === currentInterfaceLanguage);
  if (interfaceLanguageValue) interfaceLanguageValue.textContent = current?.name || 'English';
}

function setOAuthStatus(text) {
  if (oauthStatus) oauthStatus.textContent = text;
}

function openLanguagePanel() {
  if (!interfaceLanguagePanel) return;
  interfaceLanguagePanel.hidden = false;
  if (interfaceLanguageSearch) {
    interfaceLanguageSearch.value = '';
    buildLanguageOptions();
    setTimeout(() => interfaceLanguageSearch.focus(), 0);
  }
}

function closeLanguagePanel() {
  if (interfaceLanguagePanel) interfaceLanguagePanel.hidden = true;
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
    activateSection(item.dataset.section);
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
  panelMode: 'sidebar',
  theme: 'system',
  interfaceLanguage: 'en',
  format: 'mp3',
  lastFolder: '',
  downloadMode: 'bookmarks',
  clipboardUrls: '[]',
  downloadCookieMode: 'off',
  oauthCookiesText: '',
  clipboardAutoAdd: true,
  clipboardAutoSwitch: true,
  startDownloadAutomatically: false,
  removeCompletedAutomatically: true,
  simultaneousDownloads: 1,
  globalBandwidthLimitEnabled: false,
  globalBandwidthLimit: 500,
  preventSleepWhileDownloading: true,
  downloadQualityStrategy: 'highest',
  selectedResolution: '4320p',
  ignoreHighFpsVideos: false,
  preferHdrVideo: false,
  preferAv1Codec: false,
  audioDownloadFolder: '',
  videoDownloadFolder: '',
  useSameOutputPath: false,
  tempFolderMode: 'system',
  tempFolderPath: '',
  audioPlaylistSubfolder: false,
  videoPlaylistSubfolder: false,
  maxConnectionsPerVideo: 3,
  safeDownloadMode: true,
  proxyType: 'none',
  proxyAddress: '',
  proxyPort: '',
  proxyUsername: '',
  proxyPassword: '',
  outputMode: 'audio',
  outputAddNumber: false,
  outputDelimiter: ' - ',
  outputRemoveEmoji: false,
  outputSkipIfExists: false,
  outputSkipIfPreviouslyDownloaded: false,
  audioFilenameTemplate: 'artist-title',
  audioOutputFormat: 'mp3',
  audioBitrate: '192',
  audioSampleRate: '44100',
  videoFilenameTemplate: 'video-title',
  videoOriginalQuality: true,
  preferredVideoContainer: 'mp4',
  // Tags
  tagsEnabled: true,
  tagYearMode: 'dont-write',
  tagAlbumArtist: '',
  tagCommentMode: 'id-in-comment',
  tagCustomComment: '',
  tagArtwork: 'yes',
  tagWriteExplicit: false,
  tagExtractionMode: 'artist-title',
  tagSearchInDescription: false,
  tagUseUploaderIfNoArtist: true,
  tagRemoveQuotes: false,
  tagRemoveEmoji: false,
  tagSaveThumbnail: false,
  tagWriteTrackPosition: false,
  tagWritePlaylistAlbum: false,
  // URL cleaning (cleaner.js)
  urlCleanTrigger: 'always',      // 'always'|'bookmark'|'download'|'like'|'copy'|'off'
  urlCleanTargets: 'all',         // comma-joined: 'playlist,timestamps,radio,short,embed' or 'all'
  // Like shortcut
  likeShortcutEnabled: true,
  likeShortcutFolder: '',         // bookmark folder to also save to when liking
  updateCheckMode: 'startup',
};

// ── SECTION ICONS (SVG strings for search results) ──────────────
const SECTION_SVGS = {
  general:         `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  download:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  output:          `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  shortcuts:       `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h8M6 16h.01M18 16h.01M10 16h4"/></svg>`,
  'import-export': `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  about:           `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

const AUDIO_TEMPLATE_OPTIONS = [
  ['title', 'Title'],
  ['artist-title', 'Artist - Title'],
  ['title-artist', 'Title - Artist'],
  ['date-artist-title', 'Upload date - Artist - Title'],
  ['date-title', 'Upload date - Title'],
  ['date-playlist-artist-title', 'Upload date - Playlist title - Artist - Title'],
  ['bullet-title', '• Title'],
];

const VIDEO_TEMPLATE_OPTIONS = [
  ['video-title', 'Video title'],
  ['uploader-video-title', 'Video uploader - Video title'],
  ['uploader-date-video-title', 'Video uploader - Upload date - Video title'],
  ['date-video-title', 'Upload date - Video title'],
  ['date-playlist-video-title', 'Upload date - Playlist title - Video title'],
  ['date-uploader-video-title', 'Upload date - Video uploader - Video title'],
];

const BITRATE_OPTIONS = [['96','96 Kbps'],['128','128 Kbps'],['192','192 Kbps'],['224','224 Kbps'],['256','256 Kbps'],['320','320 Kbps']];
const SAMPLE_RATE_OPTIONS = [['6000','6000 Hz'],['8000','8000 Hz'],['11025','11025 Hz'],['12000','12000 Hz'],['16000','16000 Hz'],['22050','22050 Hz'],['44100','44100 Hz'],['48000','48000 Hz']];

const STATIC_SEARCH_ENTRIES = [
  { key: 'set-interface-language-trigger', title: 'Interface Language', category: 'General', section: 'general' },
  { key: 'set-default-folder', title: 'Default Bookmark Folder', category: 'General', section: 'general' },
  { key: 'set-auto-sync', title: 'Auto Sync & Clean', category: 'General', section: 'general' },
  { key: 'set-show-export', title: 'Show Export Section', category: 'General', section: 'general' },
  { key: 'set-download-path', title: 'Default Output Folder', category: 'General', section: 'general' },
  { key: 'theme-radio-group', title: 'Theme', category: 'General', section: 'general' },
  { key: 'panel-mode-radio-group', title: 'Panel Mode', category: 'General', section: 'general' },
  { key: 'oauth-google-btn', title: 'OAuth / Authentication', category: 'General', section: 'general' },
  { key: 'export-settings-btn', title: 'Export settings', category: 'Import / Export', section: 'import-export' },
  { key: 'reset-settings-btn', title: 'Reset settings', category: 'Import / Export', section: 'import-export' },
];

const GENERAL_EXTRA_DEFS = [
  { key: 'clipboardAutoAdd',    type: 'toggle', label: 'Add links from the clipboard automatically', hint: 'Watch the clipboard and add YouTube links without pasting manually.', category: 'General' },
  { key: 'clipboardAutoSwitch', type: 'toggle', label: 'Switch to Clipboard mode on URL copy',       hint: 'Automatically switch the sidebar to Clipboard mode when a YouTube URL is copied.', category: 'General' },
  { key: 'startDownloadAutomatically',  type: 'toggle', label: 'Start download automatically', hint: 'Begin downloading immediately when a queue is ready.', category: 'General' },
  { key: 'removeCompletedAutomatically',type: 'toggle', label: 'Remove completed automatically', hint: 'Clean finished items from the list when the download succeeds.', category: 'General' },
];

const DOWNLOAD_GROUPS = [
  {
    title: 'Performance',
    hint: 'Simultaneous downloads, bandwidth cap, and sleep behavior.',
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    settings: [
      { key: 'simultaneousDownloads', type: 'number', label: 'Simultaneous downloads', hint: 'How many downloads can run at the same time.', min: 1, max: 10, category: 'Download' },
      { key: 'globalBandwidthLimitEnabled', type: 'toggle', label: 'Global bandwidth limit', hint: 'Enable a shared speed cap for all active downloads.', category: 'Download' },
      { key: 'globalBandwidthLimit', type: 'number', label: 'Bandwidth limit (KB/s)', hint: 'Global speed cap in KB/s. Only applies when the limit is enabled.', min: 1, category: 'Download' },
      { key: 'preventSleepWhileDownloading', type: 'toggle', label: 'Prevent sleep while downloading', hint: 'Keep the computer awake while there is active download work.', category: 'Download' },
    ],
  },
  {
    title: 'Video Quality',
    hint: 'Resolution, codec, and frame rate preferences.',
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`,
    settings: [
      { key: 'downloadQualityStrategy', type: 'select', label: 'Quality selection', hint: 'Highest, selected resolution, or lowest available.', category: 'Download', options: [['highest','Highest available'],['selected','Selected resolution'],['lowest','Lowest available']] },
      { key: 'selectedResolution', type: 'select', label: 'Max resolution', hint: 'Used when "Selected resolution" is chosen above.', category: 'Download', options: [['4320p','4320p (8K)'],['2160p','2160p (4K)'],['1440p','1440p'],['1080p','1080p'],['720p','720p'],['480p','480p']] },
      { key: 'preferHdrVideo', type: 'toggle', label: 'Prefer HDR', hint: 'Prioritize HDR streams when available.', category: 'Download' },
      { key: 'preferAv1Codec', type: 'toggle', label: 'Prefer AV1 codec', hint: 'Choose AV1 streams over older codecs when available.', category: 'Download' },
      { key: 'ignoreHighFpsVideos', type: 'toggle', label: 'Skip 30+ fps streams', hint: 'Ignore high frame-rate variants during format selection.', category: 'Download' },
    ],
  },
  {
    title: 'Output Folders',
    hint: 'Where audio and video files are saved.',
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
    settings: [
      { key: 'audioDownloadFolder',   type: 'path',   label: 'Audio output folder',  hint: 'Audio downloads will be saved here.', category: 'Download' },
      { key: 'videoDownloadFolder',   type: 'path',   label: 'Video output folder',  hint: 'Video downloads will be saved here.', category: 'Download' },
      { key: 'useSameOutputPath',     type: 'toggle', label: 'Use same path for video', hint: 'Video will use the same folder as audio. Disables the video folder field.', category: 'Download' },
      { key: 'audioPlaylistSubfolder', type: 'toggle', label: 'Subfolder per playlist (audio)', hint: 'Create a subfolder named after the playlist for audio downloads.', category: 'Download' },
      { key: 'videoPlaylistSubfolder', type: 'toggle', label: 'Subfolder per playlist (video)', hint: 'Create a subfolder named after the playlist for video downloads.', category: 'Download' },
      { key: 'tempFolderMode', type: 'select', label: 'Temporary folder', hint: 'Where partial/temp files go during download.', category: 'Download', options: [['system','System temp folder'],['audio','Same as audio folder'],['custom','Custom path']] },
      { key: 'tempFolderPath', type: 'path', label: 'Custom temp folder', hint: 'Used when "Custom path" is selected above.', category: 'Download' },
    ],
  },
  {
    title: 'Network & Proxy',
    hint: 'Proxy server settings for routing download requests.',
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    settings: [
      { key: 'maxConnectionsPerVideo', type: 'number', label: 'Max connections per video', hint: 'Parallel connections for a single video download.', min: 1, max: 16, category: 'Download' },
      { key: 'safeDownloadMode', type: 'toggle', label: 'Safe download mode', hint: 'More conservative behavior to reduce temporary blocks.', category: 'Download' },
      { key: 'proxyType', type: 'select', label: 'Proxy type', hint: 'Route downloads through a proxy server.', category: 'Download', options: [['none','None'],['http','HTTP'],['https','HTTPS'],['socks5','SOCKS5']] },
      { key: 'proxyAddress', type: 'text', label: 'Proxy address', hint: 'Hostname or IP of the proxy.', category: 'Download', placeholder: '127.0.0.1' },
      { key: 'proxyPort', type: 'number', label: 'Proxy port', hint: 'Port number of the proxy.', category: 'Download', placeholder: '8080' },
      { key: 'proxyUsername', type: 'text', label: 'Proxy username', hint: 'Leave blank if no authentication is required.', category: 'Download', placeholder: 'Username' },
      { key: 'proxyPassword', type: 'password', label: 'Proxy password', hint: 'Leave blank if no authentication is required.', category: 'Download', placeholder: 'Password' },
    ],
  },
  {
    title: 'Tags',
    hint: 'Metadata written to downloaded audio files. Can be fully disabled.',
    icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
    settings: [
      {
        key: 'tagsEnabled', type: 'toggle',
        label: 'Write tags to files', hint: 'Master switch — disable to skip all metadata writing.',
        category: 'Download',
      },
      {
        key: 'tagYearMode', type: 'visual-radio',
        label: 'Year tag', hint: 'What to store in the Year metadata field.',
        category: 'Download',
        options: [
          ['dont-write',   'None',        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`],
          ['current-year', 'Current year',`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`],
          ['upload-date',  'Upload date', `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`],
        ],
      },
      {
        key: 'tagCommentMode', type: 'visual-radio',
        label: 'Comment field', hint: 'What to store in the comment / description tag.',
        category: 'Download',
        options: [
          ['dont-write',   'None',       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`],
          ['id-in-comment','Video ID',   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`],
          ['custom',       'Custom',     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>`],
          ['description',  'Description',`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`],
          ['video-link',   'Video URL',  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`],
        ],
      },
      { key: 'tagCustomComment', type: 'text', label: 'Custom comment text', hint: 'Used when Comment field is "Custom".', category: 'Download', placeholder: 'Your custom text here' },
      {
        key: 'tagArtwork', type: 'visual-icon-radio',
        label: 'Artwork', hint: 'How to embed the video thumbnail.',
        category: 'Download',
        options: [
          ['no',              'None',          `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="3" x2="21" y2="21"/></svg>`],
          ['yes',             'Original',      `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`],
          ['cropped-square',  'Crop square',   `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="14" height="14" rx="1"/><line x1="5" y1="3" x2="5" y2="5"/><line x1="19" y1="3" x2="19" y2="5"/><line x1="5" y1="19" x2="5" y2="21"/><line x1="19" y1="19" x2="19" y2="21"/></svg>`],
          ['inscribed-square','Fit square',    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="5" y="5" width="14" height="14" rx="1" stroke-dasharray="2 2"/></svg>`],
          ['cropped-480',     'Crop 480',      `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="14" height="14" rx="1"/><text x="12" y="13" text-anchor="middle" font-size="5" fill="currentColor" stroke="none">480</text></svg>`],
          ['inscribed-480',   'Fit 480',       `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="5" y="5" width="14" height="14" rx="1" stroke-dasharray="2 2"/><text x="12" y="13" text-anchor="middle" font-size="4" fill="currentColor" stroke="none">480</text></svg>`],
        ],
      },
      {
        key: 'tagExtractionMode', type: 'visual-radio',
        label: 'Tag extraction', hint: 'How to parse Artist and Title from the video title.',
        category: 'Download',
        options: [
          ['artist-title', 'Artist — Title', `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`],
          ['title',        'Title only',     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/></svg>`],
          ['regex',        'Regex',          `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`],
        ],
      },
      { key: 'tagAlbumArtist',           type: 'text',   label: 'Album artist', hint: 'Fixed album artist for all downloads. Blank = channel name.', category: 'Download', placeholder: 'e.g. Various Artists' },
      { key: 'tagWriteExplicit',         type: 'toggle', label: 'Write Explicit tag (M4A only)', hint: 'Adds the explicit content flag to M4A files.', category: 'Download' },
      { key: 'tagSearchInDescription',   type: 'toggle', label: 'Search tags in description', hint: 'Try to extract artist/title from the video description.', category: 'Download' },
      { key: 'tagUseUploaderIfNoArtist', type: 'toggle', label: 'Use uploader if no artist', hint: 'Fall back to the channel name when no artist is found.', category: 'Download' },
      { key: 'tagRemoveQuotes',          type: 'toggle', label: 'Remove quotes from tags', hint: 'Strip leading and trailing quote characters from tag values.', category: 'Download' },
      { key: 'tagRemoveEmoji',           type: 'toggle', label: 'Remove emoji from tags', hint: 'Strip emoji from all tag fields.', category: 'Download' },
      { key: 'tagSaveThumbnail',         type: 'toggle', label: 'Save thumbnail separately', hint: 'Downloads the video thumbnail as a separate image file.', category: 'Download' },
      { key: 'tagWriteTrackPosition',    type: 'toggle', label: 'Write track position', hint: 'Stores the item index in the playlist as the track number tag.', category: 'Download' },
      { key: 'tagWritePlaylistAlbum',    type: 'toggle', label: 'Playlist title as album', hint: 'Sets the Album field to the playlist name when downloading playlists.', category: 'Download' },
    ],
  },
];

const OUTPUT_COMMON_DEFS = [
  { key: 'outputAddNumber', type: 'toggle', label: 'Add number to filename', hint: 'Prefix playlist item index to the filename when available.', category: 'Output' },
  { key: 'outputDelimiter', type: 'text', label: 'Delimiter', hint: 'Characters used to separate parts of the filename.', category: 'Output', placeholder: ' - ' },
  { key: 'outputRemoveEmoji', type: 'toggle', label: 'Remove emoji from filename', hint: 'Strip emoji and unsupported symbols from output names.', category: 'Output' },
  { key: 'outputSkipIfExists', type: 'toggle', label: 'Skip if file already exists', hint: 'Avoid re-downloading when the output file is already present.', category: 'Output' },
  { key: 'outputSkipIfPreviouslyDownloaded', type: 'toggle', label: 'Skip if previously downloaded', hint: 'Use download history to skip items already seen, even if file is missing.', category: 'Output' },
];

const OUTPUT_AUDIO_DEFS = [
  { key: 'audioFilenameTemplate', type: 'select', label: 'Filename template', hint: 'Choose how audio files should be named.', category: 'Output', options: AUDIO_TEMPLATE_OPTIONS },
  { key: 'audioOutputFormat', type: 'select', label: 'Output format', hint: 'Original M4A or convert to another audio format.', category: 'Output', options: [['original-m4a','Original M4A'],['mp3','MP3'],['ogg','OGG Vorbis'],['wav','WAV']] },
  { key: 'audioBitrate', type: 'select', label: 'Bitrate', hint: 'Target audio bitrate for converted formats.', category: 'Output', options: BITRATE_OPTIONS },
  { key: 'audioSampleRate', type: 'select', label: 'Sample rate', hint: 'Target sample rate for converted formats.', category: 'Output', options: SAMPLE_RATE_OPTIONS },
];

const OUTPUT_VIDEO_DEFS = [
  { key: 'videoFilenameTemplate', type: 'select', label: 'Filename template', hint: 'Choose how video files should be named.', category: 'Output', options: VIDEO_TEMPLATE_OPTIONS },
  { key: 'videoOriginalQuality', type: 'toggle', label: 'Original quality', hint: 'Keep the original stream quality without re-encoding.', category: 'Output' },
  { key: 'preferredVideoContainer', type: 'select', label: 'Preferred container format', hint: 'Choose the output container format for video downloads.', category: 'Output', options: [['mp4','MP4'],['webm','WebM'],['flv','FLV']] },
];

const ABOUT_EXTRA_DEFS = [
  { key: 'updateCheckMode', type: 'select', label: 'Check for updates', hint: 'Automatically check on startup, or only when you request it manually.', category: 'About', options: [['startup','On startup'],['manual','Manual only']] },
];

// ── ACCORDION GROUP ICONS ────────────────────────────────────────
const ACCORDION_ICONS = {
  'Performance':           `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  'Video Quality':         `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`,
  'Output Folders':        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  'Network & Proxy':       `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  'Common filename rules': `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  'Audio':                 `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  'Video':                 `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`,
  'Updates':               `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
  'Tags':                  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
};

function escHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── VISUAL RADIO RENDERER ────────────────────────────────────────
function renderVisualRadio(def, section) {
  const opts = def.options.map(([value, label, icon]) =>
    `<button class="vr-opt" data-key="${def.key}" data-value="${escHtml(value)}" type="button">
      ${icon ? icon : ''}
      <span>${escHtml(label)}</span>
    </button>`
  ).join('');
  return `<div class="settings-card setting-entry-card" id="setting-card-${def.key}" data-setting-key="${def.key}" data-setting-title="${escHtml(def.label)}" data-setting-category="${escHtml(def.category)}" data-setting-section="${section}">
    <div class="vr-row">
      <div class="setting-info">
        <div class="setting-label">${escHtml(def.label)}</div>
        <div class="setting-hint">${escHtml(def.hint)}</div>
      </div>
    </div>
    <div class="vr-group" data-vr-key="${def.key}">${opts}</div>
  </div>`;
}

// ── VISUAL ICON RADIO (large visual cards, e.g. artwork) ─────────
function renderVisualIconRadio(def, section) {
  const opts = def.options.map(([value, label, icon, preview]) =>
    `<button class="vr-icon-opt" data-key="${def.key}" data-value="${escHtml(value)}" type="button" title="${escHtml(label)}">
      ${preview || icon || ''}
      <span>${escHtml(label)}</span>
    </button>`
  ).join('');
  return `<div class="settings-card setting-entry-card" id="setting-card-${def.key}" data-setting-key="${def.key}" data-setting-title="${escHtml(def.label)}" data-setting-category="${escHtml(def.category)}" data-setting-section="${section}">
    <div class="setting-info" style="margin-bottom:10px">
      <div class="setting-label">${escHtml(def.label)}</div>
      <div class="setting-hint">${escHtml(def.hint)}</div>
    </div>
    <div class="vr-icon-group" data-vr-key="${def.key}">${opts}</div>
  </div>`;
}

function renderToggle(def, section) {
  return `<div class="settings-card setting-entry-card" id="setting-card-${def.key}" data-setting-key="${def.key}" data-setting-title="${escHtml(def.label)}" data-setting-category="${escHtml(def.category)}" data-setting-section="${section}"><div class="setting-row"><div class="setting-info"><div class="setting-label">${escHtml(def.label)}</div><div class="setting-hint">${escHtml(def.hint)}</div></div><label class="toggle-switch"><input type="checkbox" id="${def.key}" data-dynamic-key="${def.key}" data-dynamic-type="toggle"/><span class="toggle-slider"></span></label></div></div>`;
}

function renderSelect(def, section) {
  return `<div class="settings-card setting-entry-card" id="setting-card-${def.key}" data-setting-key="${def.key}" data-setting-title="${escHtml(def.label)}" data-setting-category="${escHtml(def.category)}" data-setting-section="${section}"><div class="setting-row"><div class="setting-info"><div class="setting-label">${escHtml(def.label)}</div><div class="setting-hint">${escHtml(def.hint)}</div></div><select id="${def.key}" class="setting-select" data-dynamic-key="${def.key}" data-dynamic-type="select">${def.options.map(([value,label]) => `<option value="${escHtml(value)}">${escHtml(label)}</option>`).join('')}</select></div></div>`;
}

function renderInput(def, section) {
  const suffix = def.suffix ? `<span class="setting-inline-suffix">${escHtml(def.suffix)}</span>` : '';
  return `<div class="settings-card setting-entry-card" id="setting-card-${def.key}" data-setting-key="${def.key}" data-setting-title="${escHtml(def.label)}" data-setting-category="${escHtml(def.category)}" data-setting-section="${section}"><div class="setting-row"><div class="setting-info"><div class="setting-label">${escHtml(def.label)}</div><div class="setting-hint">${escHtml(def.hint)}</div></div><div class="setting-inline-control"><input id="${def.key}" class="setting-input" data-dynamic-key="${def.key}" data-dynamic-type="${def.type}" type="${def.type === 'password' ? 'password' : (def.type === 'number' ? 'number' : 'text')}" ${def.min != null ? `min="${def.min}"` : ''} ${def.max != null ? `max="${def.max}"` : ''} placeholder="${escHtml(def.placeholder || '')}"/>${suffix}</div></div></div>`;
}

function renderPath(def, section) {
  return `<div class="settings-card setting-entry-card" id="setting-card-${def.key}" data-setting-key="${def.key}" data-setting-title="${escHtml(def.label)}" data-setting-category="${escHtml(def.category)}" data-setting-section="${section}"><div class="setting-row setting-row-topaligned"><div class="setting-info"><div class="setting-label">${escHtml(def.label)}</div><div class="setting-hint">${escHtml(def.hint)}</div></div><div class="setting-path-row dynamic-path-row"><input id="${def.key}" class="setting-input" data-dynamic-key="${def.key}" data-dynamic-type="path" type="text" placeholder="C:\\Users\\you\\Downloads" autocomplete="off" spellcheck="false"/><button class="setting-browse-btn" type="button" data-browse-key="${def.key}" title="Browse…"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></button></div></div></div>`;
}

function renderSetting(def, section) {
  if (def.type === 'toggle') return renderToggle(def, section);
  if (def.type === 'select') return renderSelect(def, section);
  if (def.type === 'path') return renderPath(def, section);
  if (def.type === 'visual-radio') return renderVisualRadio(def, section);
  if (def.type === 'visual-icon-radio') return renderVisualIconRadio(def, section);
  return renderInput(def, section);
}

// Accordion-based group renderer with icons
function renderGroup(title, hint, defs, section, startOpen = false) {
  const icon = ACCORDION_ICONS[title] || '';
  const arrowSvg = `<svg class="accordion-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
  return `<details class="settings-accordion"${startOpen ? ' open' : ''}>
    <summary class="accordion-summary">
      ${icon}
      <div class="accordion-info">
        <span class="accordion-title">${escHtml(title)}</span>
        <span class="accordion-hint">${escHtml(hint)}</span>
      </div>
      ${arrowSvg}
    </summary>
    <div class="accordion-body">
      ${defs.map(def => renderSetting(def, section)).join('')}
    </div>
  </details>`;
}

function renderGeneratedSettings() {
  generalExtraSettings.innerHTML = GENERAL_EXTRA_DEFS.map(def => renderSetting(def, 'general')).join('');
  // Download groups: only Performance open by default
  downloadSettingsContainer.innerHTML = DOWNLOAD_GROUPS.map((group, i) =>
    renderGroup(group.title, group.hint, group.settings, 'download', i === 0)
  ).join('');
  outputCommonSettings.innerHTML = renderGroup('Common filename rules', 'Naming and skip rules that apply to both audio and video.', OUTPUT_COMMON_DEFS, 'output', true);
  outputAudioSettings.innerHTML = renderGroup('Audio', 'Audio naming, format, bitrate, and sample rate.', OUTPUT_AUDIO_DEFS, 'output', true);
  outputVideoSettings.innerHTML = renderGroup('Video', 'Video naming, quality, and container format.', OUTPUT_VIDEO_DEFS, 'output', true);
  aboutExtraSettings.innerHTML = `${renderGroup('Updates', 'Control how update checks are performed.', ABOUT_EXTRA_DEFS, 'about', true)}<div class="settings-card update-status-card"><div class="setting-row"><div class="setting-info"><div class="setting-label">Current version</div><div class="setting-hint">You are on the latest version (3.9.19).</div></div><button class="action-btn" type="button" id="check-updates-btn"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> Check again</button></div></div>`;
  buildSettingsSearchIndex();
}

function buildSettingsSearchIndex() {
  const dynamicEntries = Array.from(document.querySelectorAll('.setting-entry-card')).map(card => {
    // Walk up to find parent accordion summary for subIcon
    const accordion = card.closest('details.settings-accordion');
    let subIcon = '';
    if (accordion) {
      const summaryIcon = accordion.querySelector('.accordion-summary > svg:first-child');
      subIcon = summaryIcon ? summaryIcon.outerHTML : '';
    }
    return {
      key: card.dataset.settingKey,
      title: card.dataset.settingTitle,
      category: card.dataset.settingCategory,
      section: card.dataset.settingSection,
      subIcon,
    };
  });
  settingsSearchIndex = [...STATIC_SEARCH_ENTRIES, ...dynamicEntries].filter(Boolean);
}

function activateSection(sectionId) {
  navItems.forEach(item => item.classList.toggle('active', item.dataset.section === sectionId));
  sections.forEach(section => section.classList.toggle('active', section.id === `section-${sectionId}`));
}

function applyVisualRadios(saved) {
  document.querySelectorAll('.vr-opt, .vr-icon-opt').forEach(btn => {
    const key = btn.dataset.key;
    const val = btn.dataset.value;
    if (!key) return;
    const savedVal = String(saved[key] ?? DEFAULTS[key] ?? '');
    btn.classList.toggle('active', val === savedVal);
  });
}

function applyDynamicSettings(saved) {
  const allKeys = Object.keys(DEFAULTS);
  allKeys.forEach(key => {
    const el = document.getElementById(key);
    if (!el) return;
    const val = saved[key] ?? DEFAULTS[key];
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val;
  });
  applyVisualRadios(saved);
  document.querySelectorAll('.output-mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.outputMode === (saved.outputMode || DEFAULTS.outputMode)));
  outputAudioSettings.classList.toggle('active', (saved.outputMode || DEFAULTS.outputMode) === 'audio');
  outputVideoSettings.classList.toggle('active', (saved.outputMode || DEFAULTS.outputMode) === 'video');
}

function activateSection(sectionId) {
  navItems.forEach(item => item.classList.toggle('active', item.dataset.section === sectionId));
  sections.forEach(section => section.classList.toggle('active', section.id === `section-${sectionId}`));
}

const SEARCH_CATEGORIES = ['All', 'General', 'Download', 'Output', 'Shortcuts', 'Import / Export', 'About'];

function renderSearchCategoryFilter() {
  const wrap = $('search-cat-filter');
  if (!wrap) return;
  wrap.innerHTML = SEARCH_CATEGORIES.map(cat => {
    const key = cat.toLowerCase() === 'all' ? 'all' : cat;
    return `<button class="cat-btn${searchCategoryFilter === key ? ' active' : ''}" data-cat="${escHtml(key)}">${escHtml(cat)}</button>`;
  }).join('');
  wrap.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      searchCategoryFilter = btn.dataset.cat;
      renderSearchCategoryFilter();
      renderSearchResults(settingsSearchInput?.value || '');
    });
  });
}

function renderSearchResults(query = '') {
  const q = query.trim().toLowerCase();
  settingsSearchClear.hidden = !q;
  if (!q) {
    settingsSearchResults.innerHTML = '<div class="search-empty-state">Start typing to search settings by name.</div>';
    return;
  }

  let results = settingsSearchIndex.filter(item =>
    item.title.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
  );

  // Apply category filter
  if (searchCategoryFilter !== 'all') {
    results = results.filter(item => item.category === searchCategoryFilter);
  }

  if (!results.length) {
    settingsSearchResults.innerHTML = '<div class="search-empty-state">No settings matched your search.</div>';
    return;
  }

  settingsSearchResults.innerHTML = results.map(item => {
    const sectionIcon = SECTION_SVGS[item.section] || SECTION_SVGS.general;
    const subIcon = item.subIcon || '';
    return `<button type="button" class="search-result-item" data-search-target="${item.key}" data-search-section="${item.section}">
      <span class="search-result-icon">${sectionIcon}</span>
      <span class="search-result-copy">
        <span class="search-result-title">${escHtml(item.title)}</span>
        <span class="search-result-category">${subIcon ? `<span class="search-result-sub-icon">${subIcon}</span>` : ''}${escHtml(item.category)}</span>
      </span>
    </button>`;
  }).join('');
}

// ── LOAD SETTINGS ───────────────────────────────────────────────
async function loadSettings() {
  const keys = Object.keys(DEFAULTS);
  const saved = await store.get(keys);

  // Bookmark folder tree — populate both selectors at once
  await new Promise(r => chrome.bookmarks.getTree(tree => {
    defFolderSel.innerHTML = '<option value="">— Select —</option>';
    buildTree(tree, defFolderSel);
    const likeSelect = document.getElementById('set-like-shortcut-folder');
    if (likeSelect) {
      likeSelect.innerHTML = '<option value="">— Same as Bookmark folder —</option>';
      buildTree(tree, likeSelect);
      if (saved.likeShortcutFolder) likeSelect.value = saved.likeShortcutFolder;
    }
    r();
  }));

  if (saved.defaultFolder) defFolderSel.value = saved.defaultFolder;
  autoSyncToggle.checked = !!saved.autoSync;
  showExportToggle.checked = saved.showExport === true;

  if (downloadPathInput && saved.downloadPath) downloadPathInput.value = saved.downloadPath;

  // Panel mode — radio buttons
  setRadioValue('set-panel-mode', saved.panelMode || DEFAULTS.panelMode);

  // Theme — radio buttons
  const themeVal = saved.theme || 'system';
  setRadioValue('set-theme', themeVal);
  applyTheme(themeVal);

  currentInterfaceLanguage = saved.interfaceLanguage || 'en';
  buildLanguageOptions();

  if (oauthCookiesText) oauthCookiesText.value = saved.oauthCookiesText || '';
  setOAuthStatus(saved.oauthCookiesText ? 'Cookies available for restricted downloads.' : 'No cookies captured yet.');

  if (!saved.audioDownloadFolder && saved.downloadPath) saved.audioDownloadFolder = saved.downloadPath;
  if (!saved.audioOutputFormat && saved.format) {
    saved.audioOutputFormat = (saved.format === 'm4a' || saved.format === 'fast') ? 'original-m4a' : saved.format;
  }

  applyDynamicSettings(saved);

  // URL clean targets multi-select
  const urlCleanGroup = document.getElementById('url-clean-targets');
  if (urlCleanGroup) {
    const targets = saved.urlCleanTargets || 'all';
    const list = targets.split(',').map(s => s.trim());
    urlCleanGroup.querySelectorAll('.url-clean-target').forEach(btn => {
      btn.classList.toggle('active', list.includes(btn.dataset.target));
    });
  }

  // Like shortcut
  const likeToggle = document.getElementById('set-like-shortcut-enabled');
  if (likeToggle) likeToggle.checked = saved.likeShortcutEnabled !== false;
  const likeFolderRow = document.getElementById('like-shortcut-folder-row');
  if (likeFolderRow) likeFolderRow.style.display = (saved.likeShortcutEnabled !== false) ? '' : 'none';
  if (tagsEl) {
    // applyTagsVisibility is defined in initBindings — call after init
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('apply-tags-visibility'));
    }, 0);
  }
  renderSearchCategoryFilter();
  renderSearchResults('');

  if (window.ExtensionI18n) {
    await window.ExtensionI18n.applyPageTranslations(document, currentInterfaceLanguage);
  }
}

// ── AUTO-SAVE — instant on every change ─────────────────────────
async function save(key, val) {
  const payload = { [key]: val };
  if (key === 'audioDownloadFolder') payload.downloadPath = val;
  if (key === 'audioOutputFormat') payload.format = val === 'original-m4a' ? 'm4a' : val;
  await store.set(payload);
  toast('✓ Saved');
}

function initBindings() {
  defFolderSel.addEventListener('change', () => save('defaultFolder', defFolderSel.value));
  autoSyncToggle.addEventListener('change', () => save('autoSync', autoSyncToggle.checked));
  showExportToggle.addEventListener('change', () => save('showExport', showExportToggle.checked));

  // Theme — radio buttons
  document.querySelectorAll('input[name="set-theme"]').forEach(r => {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      store.set({ theme: r.value });
      applyTheme(r.value);
      toast('✓ Theme: ' + r.value);
    });
  });

  // Panel mode — radio buttons
  document.querySelectorAll('input[name="set-panel-mode"]').forEach(r => {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      const mode = r.value;
      store.set({ panelMode: mode });
      sendRuntimeMessage({ type: 'SET_PANEL_MODE', mode }).then(res => {
        toast(res?.ok === false ? (res.error || 'Panel mode update failed') : '✓ Panel mode: ' + mode);
      });
    });
  });

  if (interfaceLanguageTrigger) {
    interfaceLanguageTrigger.addEventListener('click', () => {
      if (interfaceLanguagePanel?.hidden) openLanguagePanel();
      else closeLanguagePanel();
    });
  }

  if (interfaceLanguageSearch) {
    interfaceLanguageSearch.addEventListener('input', () => {
      buildLanguageOptions(interfaceLanguageSearch.value);
    });
  }

  interfaceLanguageOptions?.addEventListener('click', async event => {
    const option = event.target.closest('[data-language-code]');
    if (!option) return;
    currentInterfaceLanguage = option.dataset.languageCode;
    await window.ExtensionI18n.setLanguage(currentInterfaceLanguage);
    buildLanguageOptions(interfaceLanguageSearch?.value || '');
    closeLanguagePanel();
    await window.ExtensionI18n.applyPageTranslations(document, currentInterfaceLanguage);
    toast('✓ Saved');
  });

  document.addEventListener('click', event => {
    if (!interfaceLanguagePanel || interfaceLanguagePanel.hidden) return;
    if (event.target.closest('#language-combobox')) return;
    closeLanguagePanel();
  });

  // Download path (only if element exists in DOM)
  if (downloadPathInput) {
    let pathTimer;
    downloadPathInput.addEventListener('input', () => {
      clearTimeout(pathTimer);
      pathTimer = setTimeout(() => save('downloadPath', downloadPathInput.value.trim()), 500);
    });
    downloadPathInput.addEventListener('change', () => save('downloadPath', downloadPathInput.value.trim()));
  }

  if (browsePathBtn) {
    browsePathBtn.addEventListener('click', async () => {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        const name = handle.name;
        const res = await sendRuntimeMessage({ type: 'RESOLVE_PATH', folderName: name });
        if (res?.path) {
          if (downloadPathInput) downloadPathInput.value = res.path;
          await store.set({ downloadPath: res.path });
          toast('✓ ' + res.path);
        } else {
          if (downloadPathInput) downloadPathInput.value = name;
          await store.set({ downloadPath: name });
          toast(`Folder "${name}" selected`);
        }
      } catch {}
    });
  }

  oauthGoogleBtn?.addEventListener('click', async () => {
    await store.set({ downloadCookieMode: 'browser' });
    chrome.tabs.create({ url: 'https://accounts.google.com/ServiceLogin?service=youtube' });
    setOAuthStatus('Google sign-in opened. After signing in, browser cookies will be used for age-restricted downloads.');
    toast('Opened Google sign-in');
  });

  oauthAnonymousBtn?.addEventListener('click', async () => {
    const res = await sendRuntimeMessage({ type: 'CAPTURE_YOUTUBE_COOKIES' });
    if (res?.ok === false) {
      setOAuthStatus(res.error || 'Could not capture cookies. Open a YouTube tab first.');
      toast(res?.error || 'Could not capture cookies');
      return;
    }
    if (oauthCookiesText) oauthCookiesText.value = res.cookieText || '';
    await store.set({ oauthCookiesText: oauthCookiesText?.value || '', downloadCookieMode: 'manual' });
    setOAuthStatus('YouTube cookies captured from the active tab and saved for restricted downloads.');
    toast('Cookies captured');
  });

  oauthCookiesText?.addEventListener('input', () => {
    const value = oauthCookiesText.value.trim();
    store.set({ oauthCookiesText: value, downloadCookieMode: value ? 'manual' : 'off' });
    setOAuthStatus(value ? 'Manual cookies saved for restricted downloads.' : 'No cookies captured yet.');
  });

  document.addEventListener('change', event => {
    const target = event.target.closest('[data-dynamic-key]');
    if (!target) return;
    const key = target.dataset.dynamicKey;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    save(key, value);
  });

  document.addEventListener('input', event => {
    const target = event.target.closest('[data-dynamic-key]');
    if (!target) return;
    if (!['text', 'number', 'password'].includes(target.dataset.dynamicType) && target.dataset.dynamicType !== 'path') return;
    clearTimeout(dynamicInputTimers.get(target.dataset.dynamicKey));
    const timer = setTimeout(() => save(target.dataset.dynamicKey, target.value), 350);
    dynamicInputTimers.set(target.dataset.dynamicKey, timer);
  });

  document.addEventListener('click', async event => {
    // Visual radio (vr-opt / vr-icon-opt)
    const vrBtn = event.target.closest('.vr-opt, .vr-icon-opt');
    if (vrBtn && vrBtn.dataset.key) {
      const key = vrBtn.dataset.key;
      const value = vrBtn.dataset.value;
      document.querySelectorAll(`.vr-opt[data-key="${key}"], .vr-icon-opt[data-key="${key}"]`).forEach(b => b.classList.remove('active'));
      vrBtn.classList.add('active');
      save(key, value);
      return;
    }

    const browseBtn = event.target.closest('[data-browse-key]');
    if (browseBtn) {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        const res = await sendRuntimeMessage({ type: 'RESOLVE_PATH', folderName: handle.name });
        const path = res?.path || handle.name;
        const input = document.getElementById(browseBtn.dataset.browseKey);
        if (input) input.value = path;
        await save(browseBtn.dataset.browseKey, path);
      } catch {}
      return;
    }

    const resultBtn = event.target.closest('[data-search-target]');
    if (resultBtn) {
      const section = resultBtn.dataset.searchSection;
      const key = resultBtn.dataset.searchTarget;
      activateSection(section);
      const targetCard = document.getElementById(`setting-card-${key}`) || document.getElementById(key)?.closest('.settings-card');
      // Open any parent <details> accordions so the element is visible
      let parent = targetCard?.parentElement?.closest('details');
      while (parent) {
        parent.open = true;
        parent = parent.parentElement?.closest('details');
      }
      targetCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const control = document.getElementById(key);
      setTimeout(() => control?.focus(), 120);
      return;
    }

    const outputBtn = event.target.closest('.output-mode-btn');
    if (outputBtn) {
      const mode = outputBtn.dataset.outputMode;
      outputModeSwitch.querySelectorAll('.output-mode-btn').forEach(btn => btn.classList.toggle('active', btn === outputBtn));
      outputAudioSettings.classList.toggle('active', mode === 'audio');
      outputVideoSettings.classList.toggle('active', mode === 'video');
      save('outputMode', mode);
      return;
    }

    if (event.target.closest('#check-updates-btn')) {
      toast('You have the latest version (3.9.19)');
    }
  });

  // Tags master switch — show/hide all sub-settings
  function applyTagsVisibility(enabled) {
    document.querySelectorAll('.setting-entry-card[data-setting-key]').forEach(card => {
      const key = card.dataset.settingKey;
      if (!key || key === 'tagsEnabled') return;
      const isTagSetting = key.startsWith('tag') && key !== 'tagsEnabled';
      if (isTagSetting) card.style.display = enabled ? '' : 'none';
    });
    // Also toggle accordion openability
    const tagsAccordion = document.querySelector('details.settings-accordion summary .accordion-title');
    // find Tags accordion
    document.querySelectorAll('details.settings-accordion').forEach(d => {
      const title = d.querySelector('.accordion-title')?.textContent?.trim();
      if (title === 'Tags') d.querySelector('.accordion-body').style.opacity = enabled ? '' : '.4';
    });
  }

  // Custom comment text — only visible when tagCommentMode === 'custom'
  function applyCustomCommentVisibility() {
    const commentMode = document.querySelector('.vr-opt[data-key="tagCommentMode"].active')?.dataset.value || DEFAULTS.tagCommentMode;
    const card = document.getElementById('setting-card-tagCustomComment');
    if (card) card.style.display = commentMode === 'custom' ? '' : 'none';
  }

  // Wire tagsEnabled toggle
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'tagsEnabled' || el.dataset.dynamicKey === 'tagsEnabled') {
      applyTagsVisibility(el.checked);
    }
  });

  // Wire comment mode vr buttons
  document.addEventListener('click', e => {
    const btn = e.target.closest('.vr-opt[data-key="tagCommentMode"]');
    if (btn) setTimeout(applyCustomCommentVisibility, 0);
  });

  // Initial apply
  store.get(['tagsEnabled', 'tagCommentMode']).then(s => {
    applyTagsVisibility(s.tagsEnabled !== false);
    applyCustomCommentVisibility();
  });
  // URL Clean Targets — multi-select with All toggle
  const urlCleanGroup = document.getElementById('url-clean-targets');
  function applyUrlCleanTargets(targetStr) {
    const targets = targetStr ? targetStr.split(',').map(s => s.trim()).filter(Boolean) : ['all'];
    urlCleanGroup?.querySelectorAll('.url-clean-target').forEach(btn => {
      btn.classList.toggle('active', targets.includes(btn.dataset.target));
    });
  }

  urlCleanGroup?.addEventListener('click', async e => {
    const btn = e.target.closest('.url-clean-target');
    if (!btn) return;
    e.stopPropagation(); // prevent main vr-opt handler from firing
    const clicked = btn.dataset.target;
    const stored = await store.get(['urlCleanTargets']);
    let currentTargets = stored.urlCleanTargets || 'all';
    let targets = currentTargets.split(',').map(s => s.trim()).filter(Boolean);

    if (clicked === 'all') {
      targets = ['all'];
    } else {
      targets = targets.filter(t => t !== 'all');
      const idx = targets.indexOf(clicked);
      if (idx >= 0) targets.splice(idx, 1);
      else targets.push(clicked);
      if (!targets.length) targets = ['all'];
    }

    const val = targets.join(',');
    applyUrlCleanTargets(val);
    save('urlCleanTargets', val);
  }, true); // capture phase — fires before bubble

  // Like shortcut — enable/disable + folder
  const likeShortcutToggle = document.getElementById('set-like-shortcut-enabled');
  const likeFolderSelect = document.getElementById('set-like-shortcut-folder');
  const likeFolderRow = document.getElementById('like-shortcut-folder-row');

  likeShortcutToggle?.addEventListener('change', () => {
    save('likeShortcutEnabled', likeShortcutToggle.checked);
    if (likeFolderRow) likeFolderRow.style.display = likeShortcutToggle.checked ? '' : 'none';
  });

  likeFolderSelect?.addEventListener('change', () => {
    save('likeShortcutFolder', likeFolderSelect.value);
    // Sync to defaultFolder so ui.js uses same folder
    if (likeFolderSelect.value) save('defaultFolder', likeFolderSelect.value);
  });

  document.getElementById('open-shortcuts-like')?.addEventListener('click', openExtensionShortcutsPage);
  settingsSearchInput?.addEventListener('input', () => renderSearchResults(settingsSearchInput.value));
  settingsSearchClear?.addEventListener('click', () => {
    settingsSearchInput.value = '';
    renderSearchResults('');
    settingsSearchInput.focus();
  });
}

// ── LISTEN FOR EXTERNAL STORAGE CHANGES (real-time sync) ────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.theme) {
    applyTheme(changes.theme.newValue);
    setRadioValue('set-theme', changes.theme.newValue || 'system');
  }
  if (changes.interfaceLanguage) {
    currentInterfaceLanguage = changes.interfaceLanguage.newValue || 'en';
    buildLanguageOptions(interfaceLanguageSearch?.value || '');
  }
  if (changes.interfaceLanguage && window.ExtensionI18n)
    window.ExtensionI18n.applyPageTranslations(document, changes.interfaceLanguage.newValue || 'en');
  if (changes.panelMode) {
    setRadioValue('set-panel-mode', changes.panelMode.newValue || 'popup');
  }
  if (changes.downloadPath && downloadPathInput)
    downloadPathInput.value = changes.downloadPath.newValue || '';
  if (changes.autoSync && autoSyncToggle)
    autoSyncToggle.checked = !!changes.autoSync.newValue;
  if (changes.showExport && showExportToggle)
    showExportToggle.checked = changes.showExport.newValue === true;
  if (changes.defaultFolder && defFolderSel)
    defFolderSel.value = changes.defaultFolder.newValue || '';
  if (changes.oauthCookiesText && oauthCookiesText && document.activeElement !== oauthCookiesText) {
    oauthCookiesText.value = changes.oauthCookiesText.newValue || '';
    setOAuthStatus(oauthCookiesText.value.trim() ? 'Manual cookies saved for restricted downloads.' : 'No cookies captured yet.');
  }
  store.get(Object.keys(DEFAULTS)).then(applyDynamicSettings);
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
  renderGeneratedSettings();
  await loadSettings();
  initBindings();
}

document.addEventListener('DOMContentLoaded', init);
