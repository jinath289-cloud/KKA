import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { useLanguage } from '@/hooks/useLanguage';
import { useToast } from '@/hooks/useToast';
import type { MessageKey } from '@/lib/i18n';
import {
  createProduct,
  createRawMaterial,
  fetchActiveRawMaterialNames,
  updateProduct,
  updateRawMaterial,
  type ProductInput,
  type RawMaterialInput,
} from '@/services/catalogService';
import { createVendor, updateVendor, type VendorInput } from '@/services/vendorService';
import type { ProductRow, RawRow, VendorRow, VendorType } from '@/types';

type CatalogKind = 'product' | 'raw' | 'vendor';

type CatalogEditorProps =
  | {
      kind: 'product';
      record?: ProductRow;
      categories: string[];
      onClose: () => void;
      onSaved: () => void;
    }
  | {
      kind: 'raw';
      record?: RawRow;
      categories: string[];
      onClose: () => void;
      onSaved: () => void;
    }
  | {
      kind: 'vendor';
      record?: VendorRow;
      categories: string[];
      onClose: () => void;
      onSaved: () => void;
    };

type FormValues = {
  sku: string;
  name: string;
  category: string;
  description: string;
  pack_size: string;
  pack_unit: 'g' | 'kg';
  retail_price: string;
  wholesale_price: string;
  stock_kg: string;
  low_stock_limit_kg: string;
  code: string;
  cost_per_kg: string;
  vendor_type: VendorType;
  contact_person: string;
  phone: string;
  village_cluster: string;
  address: string;
  upi_id: string;
  supplies: string[];
  is_id_verified: boolean;
  is_active: boolean;
};

type FormField = keyof FormValues;
type FormErrors = Partial<Record<FormField, MessageKey>>;
const VENDOR_TYPES: VendorType[] = ['farmer', 'shg', 'local_producer', 'trader'];
const VENDOR_TYPE_LABELS: Record<VendorType, MessageKey> = {
  farmer: 'catalog_vendor_type_farmer',
  shg: 'catalog_vendor_type_shg',
  local_producer: 'catalog_vendor_type_local_producer',
  trader: 'catalog_vendor_type_trader',
};
const NEW_CATEGORY = '__new_category__';

function initialValues(props: CatalogEditorProps): FormValues {
  const defaults: FormValues = {
    sku: '',
    name: '',
    category: '',
    description: '',
    pack_size: '',
    pack_unit: 'g',
    retail_price: '',
    wholesale_price: '',
    stock_kg: '0',
    low_stock_limit_kg: '0',
    code: '',
    cost_per_kg: '',
    vendor_type: 'farmer',
    contact_person: '',
    phone: '',
    village_cluster: '',
    address: '',
    upi_id: '',
    supplies: [],
    is_id_verified: false,
    is_active: true,
  };

  if (props.kind === 'product' && props.record) {
    const product = props.record;
    return {
      ...defaults,
      sku: product.sku,
      name: product.name,
      category: product.category,
      description: product.description ?? '',
      pack_size: String(product.pack_size),
      pack_unit: product.pack_unit,
      retail_price: String(product.retail_price ?? 0),
      wholesale_price: String(product.wholesale_price ?? 0),
      stock_kg: String(product.stock_kg),
      low_stock_limit_kg: String(product.low_stock_limit_kg),
      is_active: product.is_active !== false,
    };
  }
  if (props.kind === 'raw' && props.record) {
    const raw = props.record;
    return {
      ...defaults,
      code: raw.code,
      name: raw.name,
      cost_per_kg: String(raw.cost_per_kg ?? 0),
      stock_kg: String(raw.stock_kg),
      low_stock_limit_kg: String(raw.low_stock_limit_kg),
      is_active: raw.is_active !== false,
    };
  }
  if (props.kind !== 'vendor' || !props.record) return defaults;
  const vendor = props.record;
  return {
    ...defaults,
    name: vendor.name,
    vendor_type: vendor.vendor_type,
    contact_person: vendor.contact_person,
    phone: vendor.phone,
    village_cluster: vendor.village_cluster,
    address: vendor.address ?? '',
    upi_id: vendor.upi_id ?? '',
    supplies: vendor.supplies,
    is_id_verified: vendor.is_id_verified,
    is_active: vendor.is_active,
  };
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function validate(kind: CatalogKind, values: FormValues, category: string): FormErrors {
  const errors: FormErrors = {};
  const required = (field: FormField, value: string, message: MessageKey = 'catalog_error_required') => {
    if (!value.trim()) errors[field] = message;
  };
  const number = (
    field: FormField,
    value: string,
    minimum: number,
    maximum: number,
    decimals: number,
    positive = false,
  ) => {
    const parsed = Number(value);
    if (!value.trim() || !Number.isFinite(parsed)) {
      errors[field] = 'catalog_error_number';
      return;
    }
    if ((positive ? parsed <= minimum : parsed < minimum) || parsed > maximum) {
      errors[field] = positive ? 'catalog_error_positive' : 'catalog_error_nonnegative';
      return;
    }
    const fraction = value.split('.')[1] ?? '';
    if (fraction.length > decimals) errors[field] = 'catalog_error_precision';
  };

  if (kind === 'product') {
    required('sku', values.sku);
    if (values.sku && !/^[A-Z0-9-]+$/.test(values.sku)) errors.sku = 'catalog_error_sku';
    required('name', values.name);
    required('category', category);
    number('pack_size', values.pack_size, 0, 99999999.99, 2, true);
    number('retail_price', values.retail_price, 0, 99999999.99, 2);
    number('wholesale_price', values.wholesale_price, 0, 99999999.99, 2);
    number('stock_kg', values.stock_kg, 0, 999999999.999, 3);
    number('low_stock_limit_kg', values.low_stock_limit_kg, 0, 999999999.999, 3);
  } else if (kind === 'raw') {
    required('code', values.code);
    required('name', values.name);
    number('cost_per_kg', values.cost_per_kg, 0, 99999999.99, 2);
    number('stock_kg', values.stock_kg, 0, 999999999.999, 3);
    number('low_stock_limit_kg', values.low_stock_limit_kg, 0, 999999999.999, 3);
  } else {
    required('name', values.name);
    required('contact_person', values.contact_person);
    if (!/^[0-9]{10}$/.test(values.phone)) errors.phone = 'catalog_error_phone';
    required('village_cluster', values.village_cluster);
    if (values.upi_id && !/^[\w.-]+@[\w.-]+$/.test(values.upi_id)) {
      errors.upi_id = 'catalog_error_upi';
    }
  }
  return errors;
}

function numericValue(value: string): number {
  return Number(value);
}

function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="flex min-h-12 items-center gap-3 rounded-xl px-2 text-left text-base font-semibold text-stone-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
    >
      <span className={`relative inline-flex h-7 w-12 items-center rounded-full ${checked ? 'bg-leaf-700' : 'bg-stone-300'}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </span>
      {label}
    </button>
  );
}

export function CatalogEditorModal(props: CatalogEditorProps) {
  const { t } = useLanguage();
  const toast = useToast();
  const [values, setValues] = useState<FormValues>(() => initialValues(props));
  const [newCategory, setNewCategory] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [rawNames, setRawNames] = useState<string[]>([]);
  const [rawNamesFailed, setRawNamesFailed] = useState(false);

  const editing = props.record !== undefined;
  const category = values.category === NEW_CATEGORY ? newCategory : values.category;
  const supplyOptions = [...new Set([
    ...rawNames,
    ...(props.kind === 'vendor' ? props.record?.supplies ?? [] : []),
  ])];

  useEffect(() => {
    if (props.kind !== 'vendor') return;
    let cancelled = false;
    fetchActiveRawMaterialNames()
      .then((names) => {
        if (!cancelled) setRawNames(names);
      })
      .catch(() => {
        if (!cancelled) setRawNamesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [props.kind]);

  const update = (field: FormField) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = field === 'sku' ? event.target.value.toUpperCase() : event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate(props.kind, values, category);
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    if (editing && props.record?.is_active !== false && !values.is_active) {
      if (!window.confirm(t('catalog_confirm_deactivate'))) return;
    }

    setSaving(true);
    try {
      if (props.kind === 'product') {
        const input: ProductInput = {
          sku: values.sku.trim(),
          name: values.name.trim(),
          category: category.trim(),
          description: values.description.trim() || null,
          pack_size: numericValue(values.pack_size),
          pack_unit: values.pack_unit,
          retail_price: numericValue(values.retail_price),
          wholesale_price: numericValue(values.wholesale_price),
          stock_kg: numericValue(values.stock_kg),
          low_stock_limit_kg: numericValue(values.low_stock_limit_kg),
          is_active: values.is_active,
        };
        if (props.record) await updateProduct(props.record.id, input);
        else await createProduct(input);
      } else if (props.kind === 'raw') {
        const input: RawMaterialInput = {
          code: values.code.trim(),
          name: values.name.trim(),
          cost_per_kg: numericValue(values.cost_per_kg),
          stock_kg: numericValue(values.stock_kg),
          low_stock_limit_kg: numericValue(values.low_stock_limit_kg),
          is_active: values.is_active,
        };
        if (props.record) await updateRawMaterial(props.record.id, input);
        else await createRawMaterial(input);
      } else {
        const currentVendor = props.record;
        const input: VendorInput = {
          name: values.name.trim(),
          vendor_type: values.vendor_type,
          contact_person: values.contact_person.trim(),
          phone: values.phone,
          village_cluster: values.village_cluster.trim(),
          address: values.address.trim() || null,
          upi_id: values.upi_id.trim() || null,
          supplies: values.supplies,
          is_id_verified: values.is_id_verified,
          id_verified_at: values.is_id_verified
            ? currentVendor?.is_id_verified && currentVendor.id_verified_at
              ? currentVendor.id_verified_at
              : new Date().toISOString()
            : null,
          is_active: values.is_active,
        };
        if (currentVendor) await updateVendor(currentVendor.id, input);
        else await createVendor(input);
      }
      toast.success(t(editing ? 'catalog_saved' : 'catalog_created'));
      props.onSaved();
      props.onClose();
    } catch (error) {
      const code = readErrorCode(error);
      if (code === '23505') {
        setFormError(
          props.kind === 'product' ? 'catalog_error_duplicate_sku' : props.kind === 'raw' ? 'catalog_error_duplicate_raw' : 'catalog_error_duplicate_vendor',
        );
      } else if (code === '23514') {
        setFormError('catalog_error_constraint');
      } else if (code === '42501') {
        toast.error(t('catalog_error_permission'));
      } else {
        toast.error(t('error_generic'));
      }
      setSaving(false);
    }
  };

  const titleKey: Record<CatalogKind, MessageKey> = {
    product: editing ? 'catalog_edit_product' : 'catalog_add_product',
    raw: editing ? 'catalog_edit_raw' : 'catalog_add_raw',
    vendor: editing ? 'catalog_edit_vendor' : 'catalog_add_vendor',
  };

  const setField = (field: FormField, value: string | boolean | string[]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  const renderActiveField = () => (
    <SwitchField
      label={t('catalog_active')}
      checked={values.is_active}
      onChange={() => setField('is_active', !values.is_active)}
    />
  );

  return (
    <Modal
      title={t(titleKey[props.kind])}
      onClose={props.onClose}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose} disabled={saving}>{t('cancel')}</Button>
          <Button type="submit" form="catalog-editor-form" loading={saving}>
            {saving ? t('catalog_saving') : t('save')}
          </Button>
        </>
      }
    >
      <form id="catalog-editor-form" onSubmit={submit} noValidate className="space-y-5">
        {formError && <p role="alert" className="rounded-xl bg-red-50 p-3 font-semibold text-red-800">{t(formError)}</p>}

        {props.kind === 'product' && (
          <>
            <TextField label={t('catalog_sku')} value={values.sku} onChange={update('sku')} error={errors.sku && t(errors.sku)} readOnly={editing} maxLength={40} />
            <TextField label={t('catalog_name')} value={values.name} onChange={update('name')} error={errors.name && t(errors.name)} maxLength={120} />
            <SelectField
              label={t('catalog_category')}
              value={values.category}
              onChange={(event) => setField('category', event.target.value)}
              error={errors.category && t(errors.category)}
            >
              <option value="">{t('catalog_select_category')}</option>
              {props.categories.map((value) => <option key={value} value={value}>{value}</option>)}
              <option value={NEW_CATEGORY}>{t('catalog_new_category')}</option>
            </SelectField>
            {values.category === NEW_CATEGORY && (
              <TextField
                label={t('catalog_new_category')}
                value={newCategory}
                onChange={(event) => {
                  setNewCategory(event.target.value);
                  setErrors((current) => ({ ...current, category: undefined }));
                }}
                maxLength={80}
              />
            )}
            <label className="block space-y-1.5 text-sm font-semibold text-stone-700">
              <span>{t('catalog_description')}</span>
              <textarea value={values.description} onChange={update('description')} maxLength={500} rows={3} className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-900 focus:border-leaf-600 focus:outline-none focus:ring-4 focus:ring-leaf-100" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <TextField label={t('catalog_pack_size')} type="number" step="0.01" min="0.01" value={values.pack_size} onChange={update('pack_size')} error={errors.pack_size && t(errors.pack_size)} />
              <SelectField label={t('catalog_pack_unit')} value={values.pack_unit} onChange={(event) => setField('pack_unit', event.target.value)}>
                <option value="g">g</option><option value="kg">kg</option>
              </SelectField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label={t('catalog_retail_price')} type="number" step="0.01" min="0" value={values.retail_price} onChange={update('retail_price')} error={errors.retail_price && t(errors.retail_price)} />
              <TextField label={t('catalog_wholesale_price')} type="number" step="0.01" min="0" value={values.wholesale_price} onChange={update('wholesale_price')} error={errors.wholesale_price && t(errors.wholesale_price)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label={t('catalog_stock_kg')} type="number" step="0.001" min="0" value={values.stock_kg} onChange={update('stock_kg')} error={errors.stock_kg && t(errors.stock_kg)} />
              <TextField label={t('catalog_low_stock')} type="number" step="0.001" min="0" value={values.low_stock_limit_kg} onChange={update('low_stock_limit_kg')} error={errors.low_stock_limit_kg && t(errors.low_stock_limit_kg)} />
            </div>
            {editing && renderActiveField()}
          </>
        )}

        {props.kind === 'raw' && (
          <>
            <TextField label={t('catalog_code')} value={values.code} onChange={update('code')} error={errors.code && t(errors.code)} readOnly={editing} maxLength={40} />
            <TextField label={t('catalog_name')} value={values.name} onChange={update('name')} error={errors.name && t(errors.name)} maxLength={120} />
            <p className="text-sm text-stone-600">{t('catalog_unit_kg')}</p>
            <TextField label={t('catalog_cost_per_kg')} type="number" step="0.01" min="0" value={values.cost_per_kg} onChange={update('cost_per_kg')} error={errors.cost_per_kg && t(errors.cost_per_kg)} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label={t('catalog_stock_kg')} type="number" step="0.001" min="0" value={values.stock_kg} onChange={update('stock_kg')} error={errors.stock_kg && t(errors.stock_kg)} />
              <TextField label={t('catalog_low_stock')} type="number" step="0.001" min="0" value={values.low_stock_limit_kg} onChange={update('low_stock_limit_kg')} error={errors.low_stock_limit_kg && t(errors.low_stock_limit_kg)} />
            </div>
            {editing && renderActiveField()}
          </>
        )}

        {props.kind === 'vendor' && (
          <>
            {rawNamesFailed && <p role="alert" className="text-sm font-semibold text-red-700">{t('error_generic')}</p>}
            <TextField label={t('catalog_name')} value={values.name} onChange={update('name')} error={errors.name && t(errors.name)} maxLength={120} />
            <SelectField label={t('catalog_vendor_type')} value={values.vendor_type} onChange={(event) => setField('vendor_type', event.target.value as VendorType)}>
              {VENDOR_TYPES.map((value) => <option key={value} value={value}>{t(VENDOR_TYPE_LABELS[value])}</option>)}
            </SelectField>
            <TextField label={t('catalog_contact_person')} value={values.contact_person} onChange={update('contact_person')} error={errors.contact_person && t(errors.contact_person)} maxLength={120} />
            <TextField label={t('phone')} inputMode="numeric" maxLength={10} value={values.phone} onChange={(event) => setField('phone', event.target.value.replace(/\D/g, ''))} error={errors.phone && t(errors.phone)} />
            <TextField label={t('catalog_village_cluster')} value={values.village_cluster} onChange={update('village_cluster')} error={errors.village_cluster && t(errors.village_cluster)} maxLength={160} />
            <TextField label={t('catalog_address')} value={values.address} onChange={update('address')} maxLength={500} />
            <TextField label={t('catalog_upi')} value={values.upi_id} onChange={update('upi_id')} error={errors.upi_id && t(errors.upi_id)} maxLength={100} />
            <SelectField
              label={t('catalog_supplies')}
              multiple
              value={values.supplies}
              onChange={(event) => setField('supplies', Array.from(event.currentTarget.selectedOptions, (option) => option.value))}
              className="min-h-32"
            >
              {supplyOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </SelectField>
            <p className="-mt-3 text-sm text-stone-500">{t('catalog_supplies_hint')}</p>
            <SwitchField label={t('catalog_verified')} checked={values.is_id_verified} onChange={() => setField('is_id_verified', !values.is_id_verified)} />
            {editing && renderActiveField()}
          </>
        )}
      </form>
    </Modal>
  );
}
