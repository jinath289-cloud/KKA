import { useCallback, useEffect, useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import { CreateStaffModal } from '@/components/settings/CreateStaffModal';
import { ChangeRoleModal, StatusModal } from '@/components/settings/StaffActionModals';
import { StaffRow } from '@/components/settings/StaffRow';
import { Button } from '@/components/ui/Button';
import { EmptyState, ListSkeleton } from '@/components/ui/Feedback';
import { useLanguage } from '@/hooks/useLanguage';
import { listStaffProfiles } from '@/services/userService';
import type { Profile } from '@/types';

type StaffModal =
  | { kind: 'create' }
  | { kind: 'role'; profile: Profile }
  | { kind: 'status'; profile: Profile }
  | null;

interface StaffAccountsSectionProps {
  currentUserId: string;
}

export function StaffAccountsSection({ currentUserId }: StaffAccountsSectionProps) {
  const { t } = useLanguage();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [modal, setModal] = useState<StaffModal>(null);

  const refresh = useCallback(async () => {
    setLoadFailed(false);
    try {
      setProfiles(await listStaffProfiles());
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const closeModal = useCallback(() => setModal(null), []);

  const addButton = (
    <Button onClick={() => setModal({ kind: 'create' })} className="sm:shrink-0">
      <UserPlus className="h-5 w-5" aria-hidden />
      {t('add_user')}
    </Button>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-xl font-bold text-stone-900">{t('staff_title')}</h3>
          <p className="mt-1 text-base text-stone-600">{t('staff_desc')}</p>
        </div>
        {profiles && profiles.length > 0 && addButton}
      </div>

      {profiles === null && !loadFailed && <ListSkeleton />}

      {loadFailed && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="font-semibold text-red-800">{t('error_generic')}</p>
          <Button variant="outline" onClick={() => void refresh()}>
            {t('retry')}
          </Button>
        </div>
      )}

      {profiles && profiles.length === 0 && (
        <EmptyState
          icon={Users}
          title={t('staff_empty')}
          action={addButton}
        />
      )}

      {profiles && profiles.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {profiles.map((profile) => (
            <StaffRow
              key={profile.id}
              profile={profile}
              isSelf={profile.id === currentUserId}
              onChangeRole={() => setModal({ kind: 'role', profile })}
              onToggleStatus={() => setModal({ kind: 'status', profile })}
            />
          ))}
        </div>
      )}

      {modal?.kind === 'create' && (
        <CreateStaffModal onClose={closeModal} onCreated={() => void refresh()} />
      )}
      {modal?.kind === 'role' && (
        <ChangeRoleModal profile={modal.profile} onClose={closeModal} onDone={() => void refresh()} />
      )}
      {modal?.kind === 'status' && (
        <StatusModal profile={modal.profile} onClose={closeModal} onDone={() => void refresh()} />
      )}
    </section>
  );
}
