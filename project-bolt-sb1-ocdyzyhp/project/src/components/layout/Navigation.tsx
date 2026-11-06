import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/cn';
import type { NavItem, PageKey } from '@/lib/roles';

interface NavProps {
  items: NavItem[];
  active: PageKey;
  onNavigate: (page: PageKey) => void;
}

export function BottomNav({ items, active, onNavigate }: NavProps) {
  const { t } = useLanguage();

  return (
    <nav
      aria-label={t('nav_home')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <li key={item.key} className="flex-1">
              <button
                type="button"
                onClick={() => onNavigate(item.key)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-16 w-full flex-col items-center justify-center gap-1 text-sm font-semibold transition-colors',
                  isActive ? 'text-leaf-800' : 'text-stone-500 hover:text-stone-800',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-14 items-center justify-center rounded-full transition-colors',
                    isActive && 'bg-amber-200',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>{t(item.label)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar({ items, active, onNavigate }: NavProps) {
  const { t } = useLanguage();

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-stone-200 bg-white pt-24 lg:flex">
      <nav aria-label={t('nav_home')} className="flex flex-col gap-1 px-4">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-base font-semibold transition-all',
                isActive
                  ? 'bg-leaf-800 text-white shadow-md'
                  : 'text-stone-700 hover:bg-leaf-50 hover:text-leaf-900',
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span>{t(item.label)}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
