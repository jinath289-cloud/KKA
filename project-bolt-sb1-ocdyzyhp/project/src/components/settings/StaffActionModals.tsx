import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/Field';
import { useLanguage } from '@/hooks/useLanguage';
import { useToast } from '@/hooks/useToast';
import { ROLE_LABEL } from '@/lib/roles';
import { setStaffActive, setStaffRole } from '@/services/userService';
import { ROLES, type Profile, type Role } from '@/types';

interface ChangeRoleModalProps {
  profile: Profile;
  onClose: () => void;
  onDone: () => void;
}

export function ChangeRoleModal({ profile, onClose, onDone }: ChangeRoleModalProps) {
  const { t } = useLanguage();
  const toast = useToast();
  const [role, setRole] = useState<Role>(profile.role);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (role === profile.role) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await setStaffRole(profile.id, role);
      toast.success(t('role_updated'));
      onDone();
      onClose();
    } catch {
      toast.error(t('error_generic'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`${t('change_role_title')}: ${profile.full_name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button onClick={save} loading={saving}>
            {t('save')}
          </Button>
        </>
      }
    >
      <SelectField label={t('role')} value={role} onChange={(event) => setRole(event.target.value as Role)}>
        {ROLES.map((option) => (
          <option key={option} value={option}>
            {t(ROLE_LABEL[option])}
          </option>
        ))}
      </SelectField>
    </Modal>
  );
}

interface StatusModalProps {
  profile: Profile;
  onClose: () => void;
  onDone: () => void;
}

export function StatusModal({ profile, onClose, onDone }: StatusModalProps) {
  const { t } = useLanguage();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const deactivating = profile.is_active;

  const confirm = async () => {
    setSaving(true);
    try {
      await setStaffActive(profile.id, !deactivating);
      toast.success(t('status_updated'));
      onDone();
      onClose();
    } catch {
      toast.error(t('error_generic'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={deactivating ? t('confirm_deactivate_title') : t('activate')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button variant={deactivating ? 'danger' : 'secondary'} onClick={confirm} loading={saving}>
            {deactivating ? t('deactivate') : t('activate')}
          </Button>
        </>
      }
    >
      <p className="text-base text-stone-700">
        <span className="font-bold">{profile.full_name}: </span>
        {deactivating ? t('confirm_deactivate_msg') : t('confirm_activate_msg')}
      </p>
    </Modal>
  );
}
