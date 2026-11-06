import { Badge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/hooks/useLanguage';
import { ROLE_LABEL } from '@/lib/roles';
import { formatDateTime } from '@/lib/format';
import type { Profile } from '@/types';

interface StaffRowProps {
  profile: Profile;
  isSelf: boolean;
  onChangeRole: () => void;
  onToggleStatus: () => void;
}

export function StaffRow({ profile, isSelf, onChangeRole, onToggleStatus }: StaffRowProps) {
  const { t, lang } = useLanguage();

  return (
    <article className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-leaf-800 text-lg font-bold text-amber-200">
          {profile.full_name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-stone-900">
            {profile.full_name} {isSelf && <span className="text-sm font-semibold text-leaf-700">{t('you_tag')}</span>}
          </h3>
          <p className="text-base text-stone-600">{profile.phone ?? '-'}</p>
          <p className="text-sm text-stone-500">{formatDateTime(profile.created_at, lang)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="green">{t(ROLE_LABEL[profile.role])}</Badge>
        <Badge tone={profile.is_active ? 'stone' : 'red'}>
          {profile.is_active ? t('status_active') : t('status_inactive')}
        </Badge>
      </div>

      {isSelf ? (
        <p className="text-sm font-semibold text-stone-500">{t('self_action_hint')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button variant="outline" onClick={onChangeRole}>
            {t('change_role')}
          </Button>
          {profile.is_active ? (
            <Button variant="danger" onClick={onToggleStatus}>
              {t('deactivate')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={onToggleStatus}>
              {t('activate')}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
