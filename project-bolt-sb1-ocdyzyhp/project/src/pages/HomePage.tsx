import { ChevronRight, ScrollText, Settings, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Feedback';
import { useLanguage } from '@/hooks/useLanguage';
import { ROLE_LABEL, ROLE_MODULES, type PageKey } from '@/lib/roles';
import type { Profile } from '@/types';

interface HomePageProps {
  profile: Profile;
  onNavigate: (page: PageKey) => void;
}

export function HomePage({ profile, onNavigate }: HomePageProps) {
  const { t } = useLanguage();
  const modules = ROLE_MODULES[profile.role];

  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-gradient-to-br from-leaf-800 to-leaf-700 p-6 text-white shadow-lg sm:p-8">
        <p className="text-sm font-semibold text-amber-200">{t('welcome')}</p>
        <h2 className="mt-1 text-2xl font-bold sm:text-3xl">{profile.full_name}</h2>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-amber-100">{t('your_role')}:</span>
          <Badge tone="amber">{t(ROLE_LABEL[profile.role])}</Badge>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-bold text-stone-900">{t('home_workspace_title')}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <article
                key={module.title}
                className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-leaf-50 text-leaf-800">
                    <Icon className="h-6 w-6" aria-hidden />
                  </div>
                  <Badge>{t('coming_soon')}</Badge>
                </div>
                <h4 className="text-lg font-bold text-stone-900">{t(module.title)}</h4>
                <p className="text-base text-stone-600">{t(module.description)}</p>
              </article>
            );
          })}
        </div>
      </section>

      {profile.role === 'admin' && (
        <section className="grid gap-4 sm:grid-cols-2">
          <QuickLink
            icon={Settings}
            title={t('quick_settings_title')}
            description={t('quick_settings_desc')}
            onClick={() => onNavigate('settings')}
          />
          <QuickLink
            icon={ScrollText}
            title={t('quick_audit_title')}
            description={t('quick_audit_desc')}
            onClick={() => onNavigate('audit')}
          />
        </section>
      )}
    </div>
  );
}

interface QuickLinkProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}

function QuickLink({ icon: Icon, title, description, onClick }: QuickLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-stone-200 transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.99]"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-900">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold text-stone-900">{title}</p>
        <p className="text-base text-stone-600">{description}</p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  );
}
