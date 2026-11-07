import { Languages, LogOut } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

interface AppHeaderProps {
  onSignOut?: () => void;
}

export function AppHeader({ onSignOut }: AppHeaderProps) {
  const { t } = useLanguage();

  return (
    <header className="sticky top-0 z-30 border-b-4 border-amber-500 bg-leaf-800 text-white shadow-md">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-inner sm:h-14 sm:w-14">
          <img src="/logo.png" alt={t('app_name')} className="h-full w-full object-contain p-1" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold leading-tight sm:text-xl">{t('app_name')}</h1>
          <p className="mt-0.5 text-xs leading-snug text-amber-100 sm:text-sm">{t('tagline')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageToggle />
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              aria-label={t('sign_out')}
              title={t('sign_out')}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/30 text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
            >
              <LogOut className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function LanguageToggle() {
  const { lang, setLang, t } = useLanguage();
  const next = lang === 'hi' ? 'en' : 'hi';

  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      aria-label={`${t('language')}: ${t('lang_switch')}`}
      className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/30 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
    >
      <Languages className="h-4 w-4" aria-hidden />
      <span>{t('lang_switch')}</span>
    </button>
  );
}
