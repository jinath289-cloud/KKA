import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Banknote, Ban, FileText, Pencil, Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useLanguage } from '@/hooks/useLanguage';
import { useToast } from '@/hooks/useToast';
import { formatINR } from '@/lib/format';
import { BUSINESS } from '@/lib/business';
import { cancelOrder, confirmOrder, getOnlineOrderDetails, getOrder, getOrderItems, getOrderPayments, getPaymentScreenshotUrl, recordOrderPayment, setOnlineFulfilmentStatus, voidOrderPayment } from '@/services/orderService';
import type { OnlineFulfilmentStatus, OnlineOrderDetails, OrderItemRow, OrderRow, PaymentMethod, PaymentRow, Role } from '@/types';
import type { MessageKey } from '@/lib/i18n';

interface OrderDetailModalProps {
  order: OrderRow;
  role: Role;
  onClose: () => void;
  onEdit: () => void;
  onChanged: (order: OrderRow) => void;
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error) || typeof error.code !== 'string') return '';
  return error.code;
}

function getErrorMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('message' in error) || typeof error.message !== 'string') return '';
  return error.message;
}

const PAYMENT_METHOD_KEYS: Record<PaymentMethod, MessageKey> = {
  cash: 'orders_method_cash',
  upi: 'orders_method_upi',
  bank_transfer: 'orders_method_bank_transfer',
  cheque: 'orders_method_cheque',
};

export function OrderDetailModal({ order: initialOrder, role, onClose, onEdit, onChanged }: OrderDetailModalProps) {
  const { t } = useLanguage();
  const toast = useToast();
  const [order, setOrder] = useState(initialOrder);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [online, setOnline] = useState<OnlineOrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [reasonTarget, setReasonTarget] = useState<{ kind: 'cancel' } | { kind: 'void'; payment: PaymentRow } | null>(null);
  const [working, setWorking] = useState(false);
  const balance = Math.max(0, order.total - order.paid_amount);

  const reload = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [freshOrder, freshItems, freshPayments, freshOnline] = await Promise.all([
        getOrder(initialOrder.id),
        getOrderItems(initialOrder.id),
        getOrderPayments(initialOrder.id),
        getOnlineOrderDetails(initialOrder.id).catch(() => null),
      ]);
      setOrder(freshOrder);
      setItems(freshItems);
      setPayments(freshPayments);
      setOnline(freshOnline);
      onChanged(freshOrder);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [initialOrder.id, onChanged]);

  useEffect(() => {
    void reload();
  }, [reload, attempt]);

  const showActionError = (error: unknown) => {
    const message = getErrorMessage(error);
    const code = getErrorCode(error);
    if (message.includes('Insufficient stock for product')) {
      const name = message.match(/Insufficient stock for product (.+) \(SKU/)?.[1];
      toast.error(t('orders_error_stock').replace('{0}', name ?? t('orders_product')));
    } else if (message.toLowerCase().includes('void payments first')) {
      toast.error(t('orders_error_void_first'));
    } else if (code === '42501') {
      toast.error(t('orders_error_permission'));
    } else if (code === '22023' || code === '23514') {
      toast.error(t('orders_error_validation'));
    } else {
      toast.error(t('error_generic'));
    }
  };

  const confirm = async () => {
    if (!window.confirm(t('orders_confirm_warning'))) return;
    setWorking(true);
    try {
      await confirmOrder(order.id);
      toast.success(t('orders_confirmed_toast'));
      await reload();
    } catch (error) {
      showActionError(error);
    } finally {
      setWorking(false);
    }
  };

  const changeFulfilment = async (status: OnlineFulfilmentStatus) => {
    setWorking(true);
    try {
      await setOnlineFulfilmentStatus(order.id, status);
      toast.success(t('online_status_saved'));
      await reload();
    } catch (error) {
      showActionError(error);
    } finally {
      setWorking(false);
    }
  };

  const openScreenshot = async (path: string) => {
    const popup = window.open('', '_blank');
    try {
      const url = await getPaymentScreenshotUrl(path);
      if (popup) popup.location.href = url;
      else window.location.href = url;
    } catch {
      popup?.close();
      toast.error(t('online_screenshot_error'));
    }
  };

  const handleCancel = async (reason: string) => {
    setWorking(true);
    try {
      await cancelOrder(order.id, reason);
      toast.success(t('orders_cancelled_toast'));
      setReasonTarget(null);
      await reload();
    } catch (error) {
      showActionError(error);
    } finally {
      setWorking(false);
    }
  };

  const handleVoid = async (payment: PaymentRow, reason: string) => {
    setWorking(true);
    try {
      await voidOrderPayment(payment.id, reason);
      toast.success(t('orders_payment_voided'));
      setReasonTarget(null);
      await reload();
    } catch (error) {
      showActionError(error);
    } finally {
      setWorking(false);
    }
  };

  const handlePayment = async (input: { amount: number; method: PaymentMethod; reference: string; paidOn: string }) => {
    setWorking(true);
    try {
      await recordOrderPayment({
        orderId: order.id,
        amount: input.amount,
        method: input.method,
        reference: input.reference.trim() || null,
        paidOn: input.paidOn,
      });
      toast.success(t('orders_payment_recorded'));
      setPaymentOpen(false);
      await reload();
    } catch (error) {
      showActionError(error);
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <Modal
        title={`${t('orders_detail_title')} · ${order.order_number}`}
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>{t('close')}</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="h-5 w-5" aria-hidden />{t('orders_print_invoice')}</Button>
            {order.status === 'draft' && <Button variant="outline" onClick={onEdit}><Pencil className="h-5 w-5" aria-hidden />{t('orders_edit_action')}</Button>}
            {order.status === 'draft' && <Button onClick={() => void confirm()} loading={working}>{t('orders_confirm_action')}</Button>}
            {order.status === 'confirmed' && balance > 0 && <Button onClick={() => setPaymentOpen(true)} disabled={working}><Banknote className="h-5 w-5" aria-hidden />{t('orders_record_payment')}</Button>}
            {role === 'admin' && order.status !== 'cancelled' && <Button variant="danger" onClick={() => setReasonTarget({ kind: 'cancel' })} disabled={working}><Ban className="h-5 w-5" aria-hidden />{t('orders_cancel_action')}</Button>}
          </>
        }
      >
        {loading && <p className="py-6 text-center text-stone-600">{t('loading')}</p>}
        {failed && (
          <div className="flex flex-col items-start gap-3 rounded-xl bg-red-50 p-4">
            <p role="alert" className="font-semibold text-red-800">{t('error_generic')}</p>
            <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t('retry')}</Button>
          </div>
        )}
        {!loading && !failed && (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-xl bg-stone-50 p-4 sm:grid-cols-2">
              <p><strong>{t('orders_customer')}:</strong> {order.customer?.name ?? '—'}</p>
              <p><strong>{t('orders_order_date')}:</strong> {order.order_date}</p>
              <p><strong>{t('orders_status')}:</strong> {t(order.status === 'draft' ? 'orders_status_draft' : order.status === 'confirmed' ? 'orders_status_confirmed' : 'orders_status_cancelled')}</p>
              <p><strong>{t('orders_payment_status')}:</strong> {t(order.payment_status === 'unpaid' ? 'orders_payment_unpaid' : order.payment_status === 'partial' ? 'orders_payment_partial' : 'orders_payment_paid')}</p>
              {order.cancel_reason && <p className="sm:col-span-2"><strong>{t('orders_cancel_reason')}:</strong> {order.cancel_reason}</p>}
              {order.notes && <p className="sm:col-span-2"><strong>{t('orders_notes')}:</strong> {order.notes}</p>}
            </div>
            {order.status === 'draft' && (
              <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-amber-950">
                <FileText className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <p>{t('orders_draft_stock_hint')}</p>
              </div>
            )}
            {order.status === 'confirmed' && (
              <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-amber-950">
                <FileText className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <p>{t('orders_cancel_stock_hint')}</p>
              </div>
            )}

            {online && (
              <OnlineOrderPanel
                details={online}
                orderTotal={order.total}
                canUpdateStatus={order.status === 'confirmed'}
                working={working}
                onStatusChange={(status) => void changeFulfilment(status)}
                onOpenScreenshot={(path) => void openScreenshot(path)}
              />
            )}

            <div>
              <h3 className="mb-3 text-lg font-bold">{t('orders_items')}</h3>
              <div className="space-y-3 md:hidden">
                {items.map((item) => <OrderItemCard key={item.id} item={item} />)}
              </div>
              <div className="hidden overflow-x-auto rounded-xl border border-stone-200 md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-stone-100"><tr>
                    <th className="p-3">{t('orders_sku')}</th><th className="p-3">{t('orders_product')}</th>
                    <th className="p-3">{t('orders_pack')}</th><th className="p-3">{t('orders_quantity')}</th>
                    <th className="p-3">{t('orders_rate')}</th><th className="p-3">{t('orders_line_total')}</th>
                  </tr></thead>
                  <tbody className="divide-y divide-stone-100">
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="p-3">{item.sku}</td><td className="p-3">{item.product_name}</td>
                        <td className="p-3">{item.pack_size} {item.pack_unit}</td>
                        <td className="p-3">{item.quantity} {t(item.sale_type === 'retail' ? 'orders_packs' : 'orders_kg')}</td>
                        <td className="p-3">{formatINR(item.unit_price)}</td><td className="p-3 font-semibold">{formatINR(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-leaf-50 p-4 sm:grid-cols-3">
              <DetailTotal label={t('orders_subtotal')} value={formatINR(order.subtotal)} />
              <DetailTotal label={t('orders_discount')} value={formatINR(order.discount_amount)} />
              <DetailTotal label={`${t('orders_tax_amount')} (${order.tax_percent}%)`} value={formatINR(order.tax_amount)} />
              <DetailTotal label={t('orders_total')} value={formatINR(order.total)} strong />
              <DetailTotal label={t('orders_paid')} value={formatINR(order.paid_amount)} />
              <DetailTotal label={t('orders_balance')} value={formatINR(balance)} strong />
            </dl>

            <section>
              <h3 className="mb-3 text-lg font-bold">{t('orders_payments')}</h3>
              {payments.length === 0 ? <p className="rounded-xl bg-stone-50 p-4 text-stone-600">{t('orders_no_payments')}</p> : (
                <ul className="space-y-2">
                  {payments.map((payment) => (
                    <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 p-4">
                      <div className={payment.voided_at ? 'text-stone-500 line-through' : ''}>
                        <p className="font-bold">{formatINR(payment.amount)} · {t(PAYMENT_METHOD_KEYS[payment.method])}</p>
                        <p className="text-sm">{payment.paid_on}{payment.reference ? ` · ${payment.reference}` : ''}</p>
                        {payment.voided_at && <p className="text-sm no-underline">{t('orders_void_reason')}: {payment.void_reason ?? '—'}</p>}
                      </div>
                      {role === 'admin' && !payment.voided_at && (
                        <Button variant="outline" onClick={() => setReasonTarget({ kind: 'void', payment })}><Ban className="h-5 w-5" aria-hidden />{t('orders_void_payment')}</Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Modal>

      <InvoicePrint order={order} items={items} payments={payments} />
      {paymentOpen && <PaymentModal balance={balance} working={working} onClose={() => setPaymentOpen(false)} onSubmit={handlePayment} />}
      {reasonTarget && (
        <ReasonModal
          title={t(reasonTarget.kind === 'cancel' ? 'orders_cancel_action' : 'orders_void_payment')}
          label={t(reasonTarget.kind === 'cancel' ? 'orders_cancel_reason' : 'orders_void_reason')}
          loading={working}
          onClose={() => setReasonTarget(null)}
          onSubmit={(reason) => reasonTarget.kind === 'cancel' ? void handleCancel(reason) : void handleVoid(reasonTarget.payment, reason)}
        />
      )}
    </>
  );
}

const FULFILMENT_KEYS: Record<OnlineFulfilmentStatus, MessageKey> = {
  received: 'online_status_received',
  packed: 'online_status_packed',
  shipped: 'online_status_shipped',
  delivered: 'online_status_delivered',
};

function OnlineOrderPanel({
  details,
  orderTotal,
  canUpdateStatus,
  working,
  onStatusChange,
  onOpenScreenshot,
}: {
  details: OnlineOrderDetails;
  orderTotal: number;
  canUpdateStatus: boolean;
  working: boolean;
  onStatusChange: (status: OnlineFulfilmentStatus) => void;
  onOpenScreenshot: (path: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <section className="space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
      <h3 className="text-lg font-bold">{t('online_title')}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <p><strong>{t('orders_customer')}:</strong> {details.customer_name}</p>
        <p><strong>{t('online_phone')}:</strong> {details.customer_phone}</p>
        <p className="sm:col-span-2"><strong>{t('online_address')}:</strong> {details.shipping_address}, {details.city}, {details.state} - {details.pincode}</p>
        <p><strong>{t('online_payment')}:</strong> {details.payment_method}</p>
        {details.utr_number && <p><strong>{t('online_utr')}:</strong> {details.utr_number}</p>}
        <p><strong>{t('online_delivery')}:</strong> {formatINR(details.delivery_charge)}</p>
        <p><strong>{t('online_collect')}:</strong> {formatINR(orderTotal + details.delivery_charge)}</p>
      </div>
      {details.payment_method === 'UPI' && (
        details.screenshot_path
          ? <Button variant="outline" onClick={() => onOpenScreenshot(details.screenshot_path as string)}>{t('online_screenshot_view')}</Button>
          : <p className="text-stone-600">{t('online_screenshot_none')}</p>
      )}
      {canUpdateStatus ? (
        <SelectField label={t('online_fulfilment')} value={details.fulfilment_status} disabled={working} onChange={(event) => onStatusChange(event.target.value as OnlineFulfilmentStatus)}>
          {(['received', 'packed', 'shipped', 'delivered'] as const).map((value) => <option key={value} value={value}>{t(FULFILMENT_KEYS[value])}</option>)}
        </SelectField>
      ) : (
        <p className="text-stone-600">{t('online_confirm_first')}</p>
      )}
    </section>
  );
}

function OrderItemCard({ item }: { item: OrderItemRow }) {
  const { t } = useLanguage();
  return (
    <article className="rounded-xl border border-stone-200 p-4">
      <p className="font-bold">{item.product_name}</p>
      <p className="text-sm text-stone-600">{item.sku} · {item.pack_size}{item.pack_unit} · {t(item.sale_type === 'retail' ? 'orders_retail' : 'orders_wholesale')}</p>
      <div className="mt-2 flex justify-between gap-3 text-sm"><span>{item.quantity} × {formatINR(item.unit_price)}</span><strong>{formatINR(item.line_total)}</strong></div>
    </article>
  );
}

function DetailTotal({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div><dt className="text-sm text-stone-600">{label}</dt><dd className={`mt-1 ${strong ? 'text-lg font-extrabold text-leaf-900' : 'font-bold'}`}>{value}</dd></div>;
}

function PaymentModal({
  balance,
  working,
  onClose,
  onSubmit,
}: {
  balance: number;
  working: boolean;
  onClose: () => void;
  onSubmit: (input: { amount: number; method: PaymentMethod; reference: string; paidOn: string }) => void;
}) {
  const { t } = useLanguage();
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(localDate());
  const parsedAmount = Number(amount);
  const error = !Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > balance ? t('orders_error_payment_amount') : undefined;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!error) onSubmit({ amount: parsedAmount, method, reference, paidOn });
  };
  return (
    <Modal title={t('orders_record_payment')} onClose={onClose} footer={
      <><Button variant="ghost" onClick={onClose} disabled={working}>{t('cancel')}</Button><Button type="submit" form="payment-form" loading={working}>{t('save')}</Button></>
    }>
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        <p className="rounded-lg bg-stone-50 p-3">{t('orders_balance')}: <strong>{formatINR(balance)}</strong></p>
        <TextField label={t('orders_payment_amount')} type="number" step="0.01" min="0.01" max={balance} value={amount} onChange={(event) => setAmount(event.target.value)} error={error} />
        <SelectField label={t('orders_payment_method')} value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
          {(['cash', 'upi', 'bank_transfer', 'cheque'] as const).map((value) => <option key={value} value={value}>{t(PAYMENT_METHOD_KEYS[value])}</option>)}
        </SelectField>
        <TextField label={t('orders_payment_reference')} value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} />
        <TextField label={t('orders_paid_on')} type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
      </form>
    </Modal>
  );
}

function ReasonModal({
  title,
  label,
  loading,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  loading: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useLanguage();
  const [reason, setReason] = useState('');
  const [error, setError] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError(true);
      return;
    }
    onSubmit(reason.trim());
  };
  return (
    <Modal title={title} onClose={onClose} footer={
      <><Button variant="ghost" onClick={onClose} disabled={loading}>{t('cancel')}</Button><Button variant="danger" type="submit" form="reason-form" loading={loading}>{t('save')}</Button></>
    }>
      <form id="reason-form" onSubmit={submit}>
        <TextField label={label} value={reason} onChange={(event) => { setReason(event.target.value); setError(false); }} maxLength={500} required error={error ? t('orders_error_required') : undefined} />
      </form>
    </Modal>
  );
}

function InvoicePrint({ order, items, payments }: { order: OrderRow; items: OrderItemRow[]; payments: PaymentRow[] }) {
  const { t } = useLanguage();
  const title = t(order.tax_percent > 0 ? 'orders_invoice_tax' : 'orders_invoice_bill');
  const customer = order.customer;
  return (
    <>
      <style>{`
        #invoice-print { display: none; }
        @media print {
          @page { size: A4; margin: 14mm; }
          body * { visibility: hidden !important; }
          #invoice-print, #invoice-print * { visibility: visible !important; }
          #invoice-print { display: block !important; position: fixed; inset: 0; width: 100%; color: #111827; background: white; font: 10pt Arial, sans-serif; }
          #invoice-print table { width: 100%; border-collapse: collapse; }
          #invoice-print th, #invoice-print td { border-bottom: 1px solid #d6d3d1; padding: 7px 5px; text-align: left; }
          #invoice-print .invoice-total { font-size: 15pt; font-weight: bold; }
        }
      `}</style>
      <div id="invoice-print" aria-hidden="true">
        <div className="flex items-start justify-between gap-5">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="h-16 w-16 object-contain" />
            <div>
              <h1 className="text-xl font-bold">{BUSINESS.name}</h1>
              <p>{BUSINESS.legalName}</p><p>{BUSINESS.address}</p>
              <p>{BUSINESS.phone} · {BUSINESS.email}</p>
              <p>{t('orders_invoice_gstin')}: {BUSINESS.gstin}</p><p>{t('orders_invoice_upi')}: {BUSINESS.upiId}</p><p>{BUSINESS.bankDetails}</p>
            </div>
          </div>
          <div className="text-right"><h2 className="text-2xl font-bold">{title}</h2><p>{order.order_number}</p><p>{t('orders_invoice_date')}: {order.order_date}</p></div>
        </div>
        <hr className="my-4" />
        <p><strong>{t('orders_invoice_customer')}:</strong> {customer?.name ?? '—'}</p>
        <p>{customer?.phone ?? ''} {customer?.city_village ?? ''}</p>
        <p>{customer?.address ?? ''} {customer?.gstin ? `${t('orders_invoice_gstin')}: ${customer.gstin}` : ''}</p>
        <table className="mt-5">
          <thead><tr><th>{t('orders_invoice_sku')}</th><th>{t('orders_invoice_product')}</th><th>{t('orders_invoice_pack')}</th><th>{t('orders_invoice_quantity')}</th><th>{t('orders_invoice_rate')}</th><th>{t('orders_invoice_amount')}</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}>
            <td>{item.sku}</td><td>{item.product_name} ({t(item.sale_type === 'retail' ? 'orders_retail' : 'orders_wholesale')})</td><td>{item.pack_size} {item.pack_unit}</td>
            <td>{item.quantity}</td><td>{formatINR(item.unit_price)}</td><td>{formatINR(item.line_total)}</td>
          </tr>)}</tbody>
        </table>
        <dl className="ml-auto mt-5 grid max-w-xs grid-cols-2 gap-2">
          <dt>{t('orders_invoice_subtotal')}</dt><dd className="text-right">{formatINR(order.subtotal)}</dd>
          <dt>{t('orders_invoice_discount')}</dt><dd className="text-right">{formatINR(order.discount_amount)}</dd>
          <dt>{t('orders_invoice_tax_label')} ({order.tax_percent}%)</dt><dd className="text-right">{formatINR(order.tax_amount)}</dd>
          <dt className="invoice-total">{t('orders_invoice_total')}</dt><dd className="invoice-total text-right">{formatINR(order.total)}</dd>
          <dt>{t('orders_invoice_paid')}</dt><dd className="text-right">{formatINR(order.paid_amount)}</dd>
          <dt>{t('orders_invoice_balance')}</dt><dd className="text-right">{formatINR(Math.max(0, order.total - order.paid_amount))}</dd>
        </dl>
        <h3 className="mt-6 font-bold">{t('orders_invoice_payments')}</h3>
        {payments.filter((payment) => !payment.voided_at).map((payment) => (
          <p key={payment.id}>{payment.paid_on} · {t(PAYMENT_METHOD_KEYS[payment.method])} {payment.reference ? `· ${payment.reference}` : ''} · {formatINR(payment.amount)}</p>
        ))}
        <p className="mt-10 border-t pt-4 text-center">{t('orders_invoice_footer')}</p>
      </div>
    </>
  );
}
