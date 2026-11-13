import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/hooks/useLanguage';
import { useToast } from '@/hooks/useToast';
import type { MessageKey } from '@/lib/i18n';
import { saveCustomer, type CustomerInput } from '@/services/customerService';
import type { CustomerRow } from '@/types';

interface CustomerEditorModalProps {
  customer?: CustomerRow;
  onClose: () => void;
  onSaved: (customer: CustomerRow) => void;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

export function CustomerEditorModal({ customer, onClose, onSaved }: CustomerEditorModalProps) {
  const { t } = useLanguage();
  const toast = useToast();
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [cityVillage, setCityVillage] = useState(customer?.city_village ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [gstin, setGstin] = useState(customer?.gstin ?? '');
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [errors, setErrors] = useState<Partial<Record<'name' | 'phone' | 'gstin', MessageKey>>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: Partial<Record<'name' | 'phone' | 'gstin', MessageKey>> = {};
    if (!name.trim()) nextErrors.name = 'orders_error_required';
    if (phone.trim() && !/^\d{10}$/.test(phone.trim())) nextErrors.phone = 'orders_error_phone';
    if (gstin.trim() && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.trim().toUpperCase())) {
      nextErrors.gstin = 'orders_error_gstin';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const input: CustomerInput = {
      name: name.trim(),
      phone: phone.trim() || null,
      city_village: cityVillage.trim() || null,
      address: address.trim() || null,
      gstin: gstin.trim().toUpperCase() || null,
      notes: notes.trim() || null,
    };
    setSaving(true);
    try {
      const saved = await saveCustomer(input, customer?.id);
      toast.success(t(customer ? 'orders_customer_saved' : 'orders_customer_created'));
      onSaved(saved);
    } catch (error) {
      toast.error(errorCode(error) === '42501' ? t('orders_error_permission') : t('error_generic'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t(customer ? 'orders_edit_customer' : 'orders_add_customer')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('cancel')}</Button>
          <Button type="submit" form="customer-editor-form" loading={saving}>{t('save')}</Button>
        </>
      }
    >
      <form id="customer-editor-form" onSubmit={submit} noValidate className="space-y-4">
        <TextField label={t('orders_customer_name')} value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required error={errors.name ? t(errors.name) : undefined} />
        <TextField label={t('orders_customer_phone')} value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" error={errors.phone ? t(errors.phone) : undefined} />
        <TextField label={t('orders_city_village')} value={cityVillage} onChange={(event) => setCityVillage(event.target.value)} maxLength={200} />
        <TextField label={t('orders_address')} value={address} onChange={(event) => setAddress(event.target.value)} maxLength={500} />
        <TextField label={t('orders_gstin')} value={gstin} onChange={(event) => setGstin(event.target.value.toUpperCase().slice(0, 15))} maxLength={15} error={errors.gstin ? t(errors.gstin) : undefined} />
        <TextAreaField label={t('orders_notes')} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} />
      </form>
    </Modal>
  );
}
