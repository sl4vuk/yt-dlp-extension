'use strict';

(function () {
  const store = {
    get: k => new Promise(r => chrome.storage.local.get(k, r)),
    set: o => new Promise(r => chrome.storage.local.set(o, r)),
  };

  const LANGUAGE_OPTIONS = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'pt-BR', name: 'Portuguese (Brazil)' },
    { code: 'ru', name: 'Russian' },
    { code: 'uk', name: 'Ukrainian' },
    { code: 'pl', name: 'Polish' },
    { code: 'nl', name: 'Dutch' },
    { code: 'sv', name: 'Swedish' },
    { code: 'no', name: 'Norwegian' },
    { code: 'da', name: 'Danish' },
    { code: 'fi', name: 'Finnish' },
    { code: 'cs', name: 'Czech' },
    { code: 'sk', name: 'Slovak' },
    { code: 'hu', name: 'Hungarian' },
    { code: 'ro', name: 'Romanian' },
    { code: 'bg', name: 'Bulgarian' },
    { code: 'el', name: 'Greek' },
    { code: 'tr', name: 'Turkish' },
    { code: 'ar', name: 'Arabic' },
    { code: 'he', name: 'Hebrew' },
    { code: 'hi', name: 'Hindi' },
    { code: 'bn', name: 'Bengali' },
    { code: 'ur', name: 'Urdu' },
    { code: 'fa', name: 'Persian' },
    { code: 'th', name: 'Thai' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'id', name: 'Indonesian' },
    { code: 'ms', name: 'Malay' },
    { code: 'tl', name: 'Filipino' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh-CN', name: 'Chinese (Simplified)' },
    { code: 'zh-TW', name: 'Chinese (Traditional)' },
    { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'mr', name: 'Marathi' },
    { code: 'gu', name: 'Gujarati' },
    { code: 'kn', name: 'Kannada' },
    { code: 'pa', name: 'Punjabi' },
    { code: 'sw', name: 'Swahili' },
    { code: 'am', name: 'Amharic' },
    { code: 'af', name: 'Afrikaans' },
    { code: 'sq', name: 'Albanian' },
    { code: 'hy', name: 'Armenian' },
    { code: 'az', name: 'Azerbaijani' },
    { code: 'eu', name: 'Basque' },
    { code: 'be', name: 'Belarusian' },
    { code: 'bs', name: 'Bosnian' },
    { code: 'ca', name: 'Catalan' },
    { code: 'ceb', name: 'Cebuano' },
    { code: 'co', name: 'Corsican' },
    { code: 'hr', name: 'Croatian' },
    { code: 'eo', name: 'Esperanto' },
    { code: 'et', name: 'Estonian' },
    { code: 'gl', name: 'Galician' },
    { code: 'ka', name: 'Georgian' },
    { code: 'is', name: 'Icelandic' },
    { code: 'ga', name: 'Irish' },
    { code: 'kk', name: 'Kazakh' },
    { code: 'km', name: 'Khmer' },
    { code: 'ku', name: 'Kurdish' },
    { code: 'ky', name: 'Kyrgyz' },
    { code: 'lo', name: 'Lao' },
    { code: 'la', name: 'Latin' },
    { code: 'lv', name: 'Latvian' },
    { code: 'lt', name: 'Lithuanian' },
    { code: 'lb', name: 'Luxembourgish' },
    { code: 'mk', name: 'Macedonian' },
    { code: 'mg', name: 'Malagasy' },
    { code: 'mt', name: 'Maltese' },
    { code: 'mn', name: 'Mongolian' },
    { code: 'my', name: 'Myanmar (Burmese)' },
    { code: 'ne', name: 'Nepali' },
    { code: 'ps', name: 'Pashto' },
    { code: 'sr', name: 'Serbian' },
    { code: 'sl', name: 'Slovenian' },
    { code: 'so', name: 'Somali' },
    { code: 'su', name: 'Sundanese' },
    { code: 'tg', name: 'Tajik' },
    { code: 'tt', name: 'Tatar' },
    { code: 'uz', name: 'Uzbek' },
    { code: 'cy', name: 'Welsh' },
    { code: 'xh', name: 'Xhosa' },
    { code: 'yi', name: 'Yiddish' },
    { code: 'yo', name: 'Yoruba' },
    { code: 'zu', name: 'Zulu' },
  ];

  let translationCache = {};
  let activeLanguage = 'en';

  function getLanguageOptions() {
    return LANGUAGE_OPTIONS.slice();
  }

  function normalizeLanguageCode(code) {
    return code || 'en';
  }

  async function ensureCacheLoaded() {
    if (Object.keys(translationCache).length) return;
    const saved = await store.get(['translationCache']);
    translationCache = saved.translationCache || {};
  }

  function getCacheKey(lang, text) {
    return `${lang}::${text}`;
  }

  async function fetchTranslation(text, lang) {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: 'en',
      tl: lang,
      dt: 't',
      q: text,
    });
    const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`);
    if (!response.ok) throw new Error(`Translation failed (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data?.[0])) return text;
    return data[0].map(part => Array.isArray(part) ? (part[0] || '') : '').join('').trim() || text;
  }

  async function translateText(text, lang) {
    const raw = String(text || '').trim();
    if (!raw || lang === 'en') return raw;

    await ensureCacheLoaded();
    const cacheKey = getCacheKey(lang, raw);
    if (translationCache[cacheKey]) return translationCache[cacheKey];

    const translated = await fetchTranslation(raw, lang);
    translationCache[cacheKey] = translated;
    await store.set({ translationCache });
    return translated;
  }

  async function translateElements(elements, lang) {
    for (const element of elements) {
      const mode = element.dataset.i18nMode || 'text';

      if (mode === 'text') {
        const source = element.dataset.i18nSourceText || element.textContent.trim();
        element.dataset.i18nSourceText = source;
        element.textContent = lang === 'en' ? source : await translateText(source, lang);
      }

      if (mode === 'placeholder') {
        const source = element.dataset.i18nSourcePlaceholder || element.getAttribute('placeholder') || '';
        element.dataset.i18nSourcePlaceholder = source;
        element.setAttribute('placeholder', lang === 'en' ? source : await translateText(source, lang));
      }

      if (mode === 'title') {
        const source = element.dataset.i18nSourceTitle || element.getAttribute('title') || '';
        element.dataset.i18nSourceTitle = source;
        element.setAttribute('title', lang === 'en' ? source : await translateText(source, lang));
      }
    }
  }

  async function applyPageTranslations(root = document, lang = activeLanguage) {
    activeLanguage = normalizeLanguageCode(lang);
    const textNodes = Array.from(root.querySelectorAll('[data-i18n-mode="text"]'));
    const placeholderNodes = Array.from(root.querySelectorAll('[data-i18n-mode="placeholder"]'));
    const titleNodes = Array.from(root.querySelectorAll('[data-i18n-mode="title"]'));
    await translateElements(textNodes, activeLanguage);
    await translateElements(placeholderNodes, activeLanguage);
    await translateElements(titleNodes, activeLanguage);
    document.documentElement.lang = activeLanguage;
  }

  async function getSavedLanguage() {
    const saved = await store.get(['interfaceLanguage']);
    activeLanguage = normalizeLanguageCode(saved.interfaceLanguage || 'en');
    return activeLanguage;
  }

  async function setLanguage(lang) {
    activeLanguage = normalizeLanguageCode(lang);
    await store.set({ interfaceLanguage: activeLanguage });
    return activeLanguage;
  }

  window.ExtensionI18n = {
    getLanguageOptions,
    getSavedLanguage,
    setLanguage,
    applyPageTranslations,
  };
})();
