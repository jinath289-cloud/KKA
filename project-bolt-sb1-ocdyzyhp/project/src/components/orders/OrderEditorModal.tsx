import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/hooks/useLanguage';
import { useToast } from '@/hooks/useToast';
import { formatINR, formatKg } from '@/lib/format';
import { listCustomers } from '@/services/customerService';
import { confirmOrder, getOrderItems, listOrderProducts, saveOrderDraft } from '@/services/orderService';
import type { CustomerRow, OrderItemRow, OrderProductOption, OrderRow, Role } from '@/types';
import { CustomerEditorModal } from './CustomerEditorModal';

interface OrderLineForm {
  key: number;
  productId: string;
  saleType: 'retail' | 'wholesale';
  quantity: string;
}

interface OrderEditorModalProps {
  role: Role;
  order?: OrderRow;
  initialCustomerId?: string;
  onClose: () => void;
  onSaved: (order: OrderRow) => void;
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function serverMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('message' in error)) return '';
  return typeof error.message === 'string' ? error.message : '';
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

export function OrderEditorModal({ role, order, initialCustomerId, onClose, onSaved }: OrderEditorModalProps) {
  const { t } = useLanguage();
  const toast = useToast();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [products, setProducts] = useState<OrderProductOption[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [customerId, setCustomerId] = useState(order?.customer_id ?? initialCustomerId ?? '');
  const [lines, setLines] = useState<OrderLineForm[]>([]);
  const [discount, setDiscount] = useState(String(order?.discount_amount ?? 0));
  const [taxPercent, setTaxPercent] = useState(String(order?.tax_percent ?? 0));
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [orderDate, setOrderDate] = useState(order?.order_date ?? localDate());
  const [customerModal, setCustomerModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [nextKey, setNextKey] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listCustomers('', false), listOrderProducts()])
      .then(([customerRows, productRows]) => {
        if (cancelled) return;
        setCustomers(customerRows);
        setProducts(productRows);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!order) return;
    let cancelled = false;
    getOrderItems(order.id).then((rows) => {
        if (cancelled) return;
        setItems(rows);
        const draftLines = rows.map((row, index) => ({
          key: index + 1,
          productId: row.product_id,
          saleType: row.sale_type,
          quantity: String(row.quantity),
        }));
        setLines(draftLines);
        setNextKey(draftLines.length + 1);
      }).catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [order]);

  const searchedCustomers = useMemo(() => {
    const term = customerSearch.trim().toLocaleLowerCase();
    return customers.filter((customer) =>
      !term || `${customer.name} ${customer.phone ?? ''} ${customer.city_village ?? ''}`.toLocaleLowerCase().includes(term),
    );
  }, [customerSearch, customers]);

  const calculated = useMemo(() => lines.map((line) => {
    const product = products.find((candidate) => candidate.id === line.productId);
    const quantity = Number(line.quantity);
    const valid = product !== undefined && Number.isFinite(quantity) && quantity > 0 &&
      /^\d+(\.\d{1,3})?$/.test(line.quantity) &&
      (line.saleType !== 'retail' || Number.isInteger(quantity));
    const unitPrice = product ? (line.saleType === 'retail' ? product.retail_price : product.wholesale_price) : 0;
    const kg = product && valid
      ? line.saleType === 'retail'
        ? Math.round((quantity * product.pack_size / (product.pack_unit === 'g' ? 1000 : 1)) * 1000) / 1000
        : quantity
      : 0;
    const total = valid ? Math.round(quantity * unitPrice * 100) / 100 : 0;
    return { ...line, product, quantity, valid, unitPrice, kg, total, exceedsStock: valid && product !== undefined && kg > product.stock_kg };
  }), [lines, products]);
  const subtotal = calculated.reduce((sum, line) => sum + line.total, 0);
  const discountAmount = Number(discount);
  const taxRate = Number(taxPercent);
  const safeDiscount = Number.isFinite(discountAmount) ? discountAmount : 0;
  const safeTaxRate = Number.isFinite(taxRate) ? taxRate : 0;
  const taxAmount = Math.round(Math.max(0, subtotal - safeDiscount) * safeTaxRate) / 100;
  const total = Math.round((subtotal - safeDiscount + taxAmount) * 100) / 100;
  const discountInvalid = safeDiscount < 0 || safeDiscount > subtotal ||
    (role === 'sales' && safeDiscount > Math.round(subtotal * 0.1 * 100) / 100);
  const taxInvalid = safeTaxRate < 0 || safeTaxRate > 28;

  const changeLine = (key: number, patch: Partial<OrderLineForm>) => {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  };

  const save = async (confirmAfterSave: boolean) => {
    if (loading || loadError) return;
    if (!customerId) {
      toast.error(t('orders_error_select_customer'));
      return;
    }
    if (lines.length === 0 || calculated.some((line) => !line.valid)) {
      toast.error(t('orders_error_lines'));
      return;
    }
    if (discountInvalid) {
      toast.error(t(role === 'sales' && safeDiscount > subtotal * 0.1 ? 'orders_error_discount_limit' : 'orders_error_discount'));
      return;
    }
    if (taxInvalid) {
      toast.error(t('orders_error_tax'));
      return;
    }

    setSaving(true);
    try {
      const saved = await saveOrderDraft({
        orderId: order?.id ?? null,
        customerId,
        items: calculated.map((line) => ({
          product_id: line.productId,
          sale_type: line.saleType,
          quantity: line.quantity,
        })),
        discount: safeDiscount,
        taxPercent: safeTaxRate,
        notes: notes.trim() || null,
        orderDate,
      });
      if (confirmAfterSave) {
        await confirmOrder(saved.id);
      }
      const customer = customers.find((row) => row.id === customerId);
      onSaved({
        ...saved,
        customer: customer ? {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          city_village: customer.city_village,
          address: customer.address,
          gstin: customer.gstin,
        } : undefined,
      });
    } catch (error) {
      const message = serverMessage(error);
      const code = errorCode(error);
      if (message.includes('Insufficient stock for product')) {
        const productName = message.match(/Insufficient stock for product (.+) \(SKU/)?.[1];
        toast.error(t('orders_error_stock').replace('{0}', productName ?? t('orders_product')));
      } else if (message.includes('discount') && message.includes('10 percent')) {
        toast.error(t('orders_error_discount_limit'));
      } else if (code === '42501') {
        toast.error(t('orders_error_permission'));
      } else if (code === '22023' || code === '23514') {
        toast.error(t('orders_error_validation'));
      } else {
        toast.error(t('error_generic'));
      }
      setSaving(false);
    }
  };

  const saveCustomerInline = (saved: CustomerRow) => {
    setCustomers((current) => [...current.filter((row) => row.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
    setCustomerId(saved.id);
    setCustomerModal(false);
  };

  return (
    <>
      <Modal
        title={t(order ? 'orders_edit_title' : 'orders_new_title')}
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>{t('cancel')}</Button>
            <Button variant="outline" onClick={() => void save(false)} loading={saving} disabled={loading || loadError}>{t('orders_save_draft')}</Button>
            <Button onClick={() => {
              if (window.confirm(t('orders_confirm_warning'))) void save(true);
            }} loading={saving} disabled={loading || loadError}>{t('orders_confirm_action')}</Button>
          </>
        }
      >
        {loading && <p className="py-6 text-center text-stone-600">{t('loading')}</p>}
        {loadError && <p role="alert" className="rounded-xl bg-red-50 p-4 font-semibold text-red-800">{t('error_generic')}</p>}
        {!loading && !loadError && (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-3">
                <TextField label={t('orders_search_customers')} value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} />
                <SelectField label={t('orders_customer')} value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                  <option value="">{t('orders_select_customer')}</option>
                  {searchedCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>
                  ))}
                </SelectField>
              </div>
              <Button variant="outline" onClick={() => setCustomerModal(true)}><Plus className="h-5 w-5" aria-hidden />{t('orders_add_customer')}</Button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold">{t('orders_items')}</h3>
                <Button variant="outline" onClick={() => {
                  setLines((current) => [...current, { key: nextKey, productId: '', saleType: 'retail', quantity: '' }]);
                  setNextKey((value) => value + 1);
                }}><Plus className="h-5 w-5" aria-hidden />{t('orders_add_line')}</Button>
              </div>
              {lines.map((line) => {
                const item = calculated.find((candidate) => candidate.key === line.key);
                return (
                  <div key={line.key} className="space-y-3 rounded-xl border border-stone-200 p-4">
                    <div className="flex items-start gap-2">
                      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                        <SelectField label={t('orders_product')} value={line.productId} onChange={(event) => changeLine(line.key, { productId: event.target.value })}>
                          <option value="">{t('orders_select_product')}</option>
                          {products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}
                        </SelectField>
                        <SelectField label={t('orders_sale_type')} value={line.saleType} onChange={(event) => changeLine(line.key, { saleType: event.target.value as OrderLineForm['saleType'] })}>
                          <option value="retail">{t('orders_retail')}</option>
                          <option value="wholesale">{t('orders_wholesale')}</option>
                        </SelectField>
                      </div>
                      <button type="button" aria-label={t('orders_remove_line')} onClick={() => setLines((current) => current.filter((entry) => entry.key !== line.key))} className="mt-7 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200">
                        <Trash2 className="h-5 w-5" aria-hidden />
                      </button>
                    </div>
                    <TextField label={t(line.saleType === 'retail' ? 'orders_quantity_packs' : 'orders_quantity_kg')} type="number" min="0.001" step={line.saleType === 'retail' ? '1' : '0.001'} value={line.quantity} onChange={(event) => changeLine(line.key, { quantity: event.target.value })} />
                    {item?.product && (
                      <div className="flex flex-wrap justify-between gap-2 rounded-lg bg-stone-50 p-3 text-sm">
                        <span>{t('orders_unit_price')}: <strong>{formatINR(item.unitPrice)}</strong></span>
                        <span>{t('orders_line_total')}: <strong>{formatINR(item.total)}</strong></span>
                        <span>{t('orders_kg_equivalent')}: <strong>{formatKg(item.kg)}</strong></span>
                        <span>{t('orders_current_stock')}: <strong>{formatKg(item.product.stock_kg)}</strong></span>
                      </div>
                    )}
                    {item?.exceedsStock && <p role="alert" className="text-sm font-semibold text-amber-800">{t('orders_stock_warning').replace('{0}', item.product?.name ?? '')}</p>}
                    {order && items.some((savedItem) => savedItem.product_id === line.productId && !products.some((product) => product.id === savedItem.product_id)) && (
                      <p className="text-sm font-semibold text-amber-800">{t('orders_inactive_product_warning')}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={t('orders_discount')} type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} error={discountInvalid ? t(role === 'sales' && safeDiscount > subtotal * 0.1 ? 'orders_error_discount_limit' : 'orders_error_discount') : undefined} />
              <TextField label={t('orders_tax_percent')} type="number" min="0" max="28" step="0.01" value={taxPercent} onChange={(event) => setTaxPercent(event.target.value)} error={taxInvalid ? t('orders_error_tax') : undefined} />
              <TextField label={t('orders_order_date')} type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} />
            </div>
            <TextAreaField label={t('orders_notes')} value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={2000} />
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-leaf-50 p-4 sm:grid-cols-4">
              <TotalCell label={t('orders_subtotal')} value={formatINR(subtotal)} />
              <TotalCell label={t('orders_discount')} value={formatINR(safeDiscount)} />
              <TotalCell label={t('orders_tax_amount')} value={formatINR(taxAmount)} />
              <TotalCell label={t('orders_total')} value={formatINR(total)} strong />
            </dl>
          </div>
        )}
      </Modal>
      {customerModal && <CustomerEditorModal onClose={() => setCustomerModal(false)} onSaved={saveCustomerInline} />}
    </>
  );
}

function TotalCell({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><dt className="text-sm text-stone-600">{label}</dt><dd className={`mt-1 ${strong ? 'text-lg font-extrabold text-leaf-900' : 'font-bold text-stone-900'}`}>{value}</dd></div>;
}
