import { createContext, useCallback, useContext, type ReactNode } from 'react';
import en from '../locales/en.json';
import ja from '../locales/ja.json';
import vi from '../locales/vi.json';
import type { Language } from './types';

type Dictionary = Record<string, string>;
const DICTIONARIES: Record<Language, Dictionary> = { en, ja, vi };

export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', ja: '日本語', vi: 'Tiếng Việt' };

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export function translate(language: Language, key: string, params: Record<string, string | number> = {}) {
  const template = DICTIONARIES[language]?.[key] ?? DICTIONARIES.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

const LanguageContext = createContext<Language>('en');

export function LanguageProvider({ language, children }: { language: Language; children: ReactNode }) {
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

export function useT(): Translate {
  const language = useContext(LanguageContext);
  return useCallback((key, params) => translate(language, key, params), [language]);
}

export function useLanguage() {
  return useContext(LanguageContext);
}
