/**
 * i18n Translator
 * Handles message translation based on configured language
 */

import { getLocale } from './locales.js';

let currentLanguage = 'en';

/**
 * Initialize translator with a specific language
 * @param {string} lang - Language code (e.g., 'en', 'de')
 */
export function initializeTranslator(lang = 'en') {
  const validLanguages = ['en', 'de'];
  currentLanguage = validLanguages.includes(lang) ? lang : 'en';
}

/**
 * Get current language
 * @returns {string} Current language code
 */
export function getCurrentLanguage() {
  return currentLanguage;
}

/**
 * Translate a message key
 * Supports both static strings and functions with parameters
 * @param {string} key - Message key (e.g., 'search.results.title')
 * @param {...any} args - Arguments to pass to translation function
 * @returns {string} Translated message
 */
export function t(key, ...args) {
  const locale = getLocale(currentLanguage);
  
  if (!locale[key]) {
    // Fallback to English if key not found
    const enLocale = getLocale('en');
    if (!enLocale[key]) {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
    const translation = enLocale[key];
    return typeof translation === 'function' ? translation(...args) : translation;
  }
  
  const translation = locale[key];
  return typeof translation === 'function' ? translation(...args) : translation;
}

/**
 * Alias for t() for shorthand usage
 */
export const __ = t;
