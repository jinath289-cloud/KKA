import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messages, type Lang, type MessageKey } from '@/lib/i18n';

const STORAGE_KEY = 'khagi-kala-lang';

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLang(): Lang {
  return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'hi';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<LanguageContextValue>(() => {
    const setLang = (next: Lang) => {
      localStorage.setItem(STORAGE_KEY, next);
      setLangState(next);
    };
    return { lang, setLang, t: (key) => messages[key][lang] };
  }, [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  return context;
}
