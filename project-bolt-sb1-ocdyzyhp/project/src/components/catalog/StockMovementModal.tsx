import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/hooks/useLanguage';
import { useToast } from '@/hooks/useToast';
import { movementDelta, movementLabelKey, movementTypesFor, type StockDirection } from '@/lib/stock';
import { fetchStockVendors, recordStockMovement } from '@/services/stockService';
import type { Role, StockItemOption, StockMovementType } from '@/types';

interface StockMovementModalProps {
  item: StockItemOption;
  direction: StockDirection;
  role: Role;
  onClose: () => void;
  onSaved: () => void;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

export function StockMovementModal({ item, direction, role, onClose, onSaved }: StockMovementModalProps) {
  const { t } = useLanguage();
  const toast = useToast();
  const movementTypes = useMemo(
    () => movementTypesFor(role, item.item_type, direction),
    [direction, item.item_type, role],
  );
  const [movementType, setMovementType] = useState<StockMovementType>(movementTypes[0] ?? 'purchase_in');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }> | null>(null);
  const [vendorLoadFailed, setVendorLoadFailed] = useState(false);
  const [quantityError, setQuantityError] = useState<'stock_error_insufficient' | 'stock_error_quantity' | null>(null);
  const [saving, setSaving] = useState(false);

  const isPurchase = movementType === 'purchase_in';
  const parsedQuantity = Number(quantity);
  const validQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 && /^\d+(\.\d{1,3})?$/.test(quantity);
  const resultingStock = item.stock_kg + (validQuantity ? movementDelta(movementType, parsedQuantity) : 0);
  const isAdjustment = movementType === 'adjustment_in' || movementType === 'adjustment_out';

  useEffect(() => {
    if (!isPurchase) {
      setVendors(null);
      setVendorLoadFailed(false);
      return;
    }
    let cancelled = false;
    fetchStockVendors()
      .then((rows) => {
        if (!cancelled) setVendors(rows);
      })
      .catch(() => {
        if (!cancelled) setVendorLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isPurchase]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validQuantity || resultingStock < 0) {
      setQuantityError(resultingStock < 0 ? 'stock_error_insufficient' : 'stock_error_quantity');
      return;
    }
    if (isAdjustment && !note.trim()) {
      toast.error(t('stock_error_adjustment_note'));
      return;
    }
    if (vendorLoadFailed) {
      toast.error(t('stock_error_vendor_list'));
      return;
    }

    setQuantityError(null);
    setSaving(true);
    try {
      await recordStockMovement({
        item_type: item.item_type,
        item_id: item.id,
        movement_type: movementType,
        quantity_kg: parsedQuantity,
        note: note.trim() || null,
        vendor_id: isPurchase && vendorId ? vendorId : null,
      });
      toast.success(t('stock_saved'));
      onSaved();
      onClose();
    } catch (error) {
      const code = errorCode(error);
      if (code === 'P0001') toast.error(t('stock_error_insufficient'));
      else if (code === '42501') toast.error(t('stock_error_permission'));
      else if (code === 'P0002') toast.error(t('stock_error_inactive_item'));
      else toast.error(t('error_generic'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t(direction === 'in' ? 'stock_in_title' : 'stock_out_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('cancel')}</Button>
          <Button type="submit" form="stock-movement-form" loading={saving}>
            {saving ? t('stock_saving') : t('stock_record')}
          </Button>
        </>
      }
    >
      <form id="stock-movement-form" onSubmit={submit} noValidate className="space-y-5">
        <div className="rounded-xl bg-stone-50 p-4">
          <p className="font-bold text-stone-900">{item.name}</p>
          <p className="text-sm text-stone-600">{item.code} · {t('stock_current')}: {item.stock_kg} kg</p>
          <p className={`mt-1 text-sm font-semibold ${resultingStock < 0 ? 'text-red-700' : 'text-leaf-800'}`}>
            {t('stock_after')}: {resultingStock.toFixed(3)} kg
          </p>
        </div>
        <SelectField
          label={t('stock_movement_type')}
          value={movementType}
          onChange={(event) => setMovementType(event.target.value as StockMovementType)}
        >
          {movementTypes.map((type) => <option key={type} value={type}>{t(movementLabelKey(type))}</option>)}
        </SelectField>
        <TextField
          label={t('stock_quantity')}
          type="number"
          min="0.001"
          step="0.001"
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value);
            setQuantityError(null);
          }}
          error={quantityError ? t(quantityError) : undefined}
        />
        {isPurchase && (
          <>
            {vendorLoadFailed && <p role="alert" className="text-sm font-semibold text-red-700">{t('stock_error_vendor_list')}</p>}
            <SelectField
              label={t('stock_vendor_optional')}
              value={vendorId}
              onChange={(event) => setVendorId(event.target.value)}
              disabled={vendors === null || vendorLoadFailed}
            >
              <option value="">{t('stock_no_vendor')}</option>
              {(vendors ?? []).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </SelectField>
          </>
        )}
        <TextAreaField
          label={t(isAdjustment ? 'stock_adjustment_note' : 'stock_note')}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={500}
        />
      </form>
    </Modal>
  );
}
