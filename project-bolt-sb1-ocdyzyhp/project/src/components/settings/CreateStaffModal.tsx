import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { useLanguage } from '@/hooks/useLanguage';
import { useToast } from '@/hooks/useToast';
import type { MessageKey } from '@/lib/i18n';
import { ROLE_LABEL } from '@/lib/roles';
import { createStaffAccount, type NewStaffInput } from '@/services/userService';
import { ROLES, type Role } from '@/types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormValues = Record<keyof NewStaffInput, string>;
type FormErrors = Partial<Record<keyof NewStaffInput, MessageKey>>;

const EMPTY_FORM: FormValues = { full_name: '', phone: '', email: '', password: '', role: 'sales' };

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (values.full_name.trim().length < 2) errors.full_name = 'err_name_short';
  if (!/^[0-9]{10}$/.test(values.phone)) errors.phone = 'err_phone';
  if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = 'err_invalid_email';
  if (values.password.length < 8) errors.password = 'err_password_short';
  if (!ROLES.includes(values.role as Role)) errors.role = 'err_role';
  return errors;
}

interface CreateStaffModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateStaffModal({ onClose, onCreated }: CreateStaffModalProps) {
  const { t } = useLanguage();
  const toast = useToast();
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const update = (field: keyof FormValues) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await createStaffAccount({
        full_name: values.full_name.trim(),
        phone: values.phone,
        email: values.email.trim(),
        password: values.password,
        role: values.role as Role,
      });
      toast.success(t('user_created'));
      onCreated();
      onClose();
    } catch (error) {
      const alreadyExists = error instanceof Error && /already/i.test(error.message);
      toast.error(t(alreadyExists ? 'err_email_exists' : 'error_generic'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('create_user_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button type="submit" form="create-staff-form" loading={saving}>
            {saving ? t('creating') : t('create_user_button')}
          </Button>
        </>
      }
    >
      <form id="create-staff-form" onSubmit={handleSubmit} noValidate className="space-y-5">
        <p className="text-base text-stone-600">{t('create_user_desc')}</p>
        <TextField
          label={t('full_name')}
          value={values.full_name}
          onChange={update('full_name')}
          error={errors.full_name && t(errors.full_name)}
          autoComplete="off"
        />
        <TextField
          label={t('phone')}
          inputMode="numeric"
          maxLength={10}
          value={values.phone}
          onChange={(event) => setValues((current) => ({ ...current, phone: event.target.value.replace(/\D/g, '') }))}
          error={errors.phone && t(errors.phone)}
        />
        <TextField
          label={t('email')}
          type="email"
          inputMode="email"
          autoComplete="off"
          value={values.email}
          onChange={update('email')}
          error={errors.email && t(errors.email)}
        />
        <TextField
          label={t('temp_password')}
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={update('password')}
          error={errors.password && t(errors.password)}
          hint={t('password_hint')}
        />
        <SelectField
          label={t('role')}
          value={values.role}
          onChange={update('role')}
          error={errors.role && t(errors.role)}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {t(ROLE_LABEL[role])}
            </option>
          ))}
        </SelectField>
      </form>
    </Modal>
  );
}
