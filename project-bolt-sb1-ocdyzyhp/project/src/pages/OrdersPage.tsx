import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Plus } from 'lucide-react';
import { OrderDetailModal } from '@/components/orders/OrderDetailModal';
import { OrderEditorModal } from '@/components/orders/OrderEditorModal';
import { Button } from '@/components/ui/Button';
import { EmptyState, ListSkeleton, Badge } from '@/components/ui/Feedback';
import { SelectField, TextField } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { useLanguage } from '@/hooks/useLanguage';
import { formatINR } from '@/lib/format';
import { listOrders } from '@/services/orderService';
import type { OrderRow, OrderStatus, Role } from '@/types';

const PAGE_SIZE = 20;

interface OrdersPageProps {
  role: Role;
  customerId?: string;
}

function statusKey(status: OrderStatus): 'orders_status_draft' | 'orders_status_confirmed' | 'orders_status_cancelled' {
  if (status === 'draft') return 'orders_status_draft';
  return status === 'confirmed' ? 'orders_status_confirmed' : 'orders_status_cancelled';
}

function paymentKey(status: OrderRow['payment_status']): 'orders_payment_unpaid' | 'orders_payment_partial' | 'orders_payment_paid' {
  if (status === 'unpaid') return 'orders_payment_unpaid';
  return status === 'partial' ? 'orders_payment_partial' : 'orders_payment_paid';
}

export function OrdersPage({ role, customerId }: OrdersPageProps) {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [paymentStatus, setPaymentStatus] = useState<OrderRow['payment_status'] | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderRow | null | undefined>(undefined);

  const reload = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const result = await listOrders({
        status,
        paymentStatus,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search,
        customerId,
        from: page * PAGE_SIZE,
        pageSize: PAGE_SIZE,
      });
      setOrders(result.rows);
      setHasMore(result.hasMore);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [status, paymentStatus, fromDate, toDate, search, customerId, page]);

  useEffect(() => {
    void reload();
  }, [reload, attempt]);

  const filterChange = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setPage(0);
  };

  const orderSaved = (order: OrderRow) => {
    setEditingOrder(undefined);
    setSelectedOrder(order);
    void reload();
  };

  const editDraft = () => {
    if (!selectedOrder) return;
    setEditingOrder(selectedOrder);
    setSelectedOrder(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('orders_title')}
        subtitle={t('orders_subtitle')}
        action={<Button onClick={() => setEditingOrder(null)}><Plus className="h-5 w-5" aria-hidden />{t('orders_new_button')}</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <TextField label={t('orders_search')} value={search} onChange={(event) => filterChange(setSearch, event.target.value)} />
        <SelectField label={t('orders_status')} value={status} onChange={(event) => filterChange(setStatus, event.target.value as OrderStatus | '')}>
          <option value="">{t('orders_all_statuses')}</option>
          <option value="draft">{t('orders_status_draft')}</option>
          <option value="confirmed">{t('orders_status_confirmed')}</option>
          <option value="cancelled">{t('orders_status_cancelled')}</option>
        </SelectField>
        <SelectField label={t('orders_payment_status')} value={paymentStatus} onChange={(event) => filterChange(setPaymentStatus, event.target.value as OrderRow['payment_status'] | '')}>
          <option value="">{t('orders_all_payment_statuses')}</option>
          <option value="unpaid">{t('orders_payment_unpaid')}</option>
          <option value="partial">{t('orders_payment_partial')}</option>
          <option value="paid">{t('orders_payment_paid')}</option>
        </SelectField>
        <TextField label={t('orders_from_date')} type="date" value={fromDate} onChange={(event) => filterChange(setFromDate, event.target.value)} />
        <TextField label={t('orders_to_date')} type="date" value={toDate} onChange={(event) => filterChange(setToDate, event.target.value)} />
      </div>
      {customerId && <p className="rounded-xl bg-leaf-50 p-3 text-sm text-leaf-900">{t('orders_customer_filter')}</p>}

      {loading && <ListSkeleton rows={5} />}
      {failed && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p role="alert" className="font-semibold text-red-800">{t('error_generic')}</p>
          <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t('retry')}</Button>
        </div>
      )}
      {!loading && !failed && orders.length === 0 && <EmptyState icon={ClipboardList} title={t('orders_empty')} />}

      {!loading && !failed && orders.length > 0 && (
        <>
          <div className="space-y-3 md:hidden">
            {orders.map((order) => <OrderCard key={order.id} order={order} onOpen={() => setSelectedOrder(order)} />)}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 md:block">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-stone-100 text-stone-700"><tr>
                <th className="p-3">{t('orders_number')}</th><th className="p-3">{t('orders_customer')}</th>
                <th className="p-3">{t('orders_order_date')}</th><th className="p-3">{t('orders_status')}</th>
                <th className="p-3">{t('orders_payment_status')}</th><th className="p-3">{t('orders_total')}</th>
                <th className="p-3">{t('orders_paid')}</th><th className="p-3">{t('orders_balance')}</th>
              </tr></thead>
              <tbody className="divide-y divide-stone-100">
                {orders.map((order) => (
                  <tr key={order.id} className="cursor-pointer hover:bg-leaf-50" onClick={() => setSelectedOrder(order)}>
                    <td className="p-3 font-bold text-leaf-900">{order.order_number}</td>
                    <td className="p-3">{order.customer?.name ?? '—'}</td>
                    <td className="p-3">{order.order_date}</td>
                    <td className="p-3"><StatusBadge label={t(statusKey(order.status))} status={order.status} /></td>
                    <td className="p-3"><Badge tone={order.payment_status === 'paid' ? 'green' : order.payment_status === 'partial' ? 'amber' : 'stone'}>{t(paymentKey(order.payment_status))}</Badge></td>
                    <td className="p-3 font-semibold">{formatINR(order.total)}</td><td className="p-3">{formatINR(order.paid_amount)}</td>
                    <td className="p-3">{formatINR(Math.max(0, order.total - order.paid_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>{t('stock_previous')}</Button>
            <span className="text-sm font-semibold text-stone-600">{t('stock_page_number').replace('{0}', String(page + 1))}</span>
            <Button variant="outline" disabled={!hasMore} onClick={() => setPage((value) => value + 1)}>{t('stock_next')}</Button>
          </div>
        </>
      )}

      {editingOrder !== undefined && (
        <OrderEditorModal
          key={editingOrder?.id ?? 'new'}
          role={role}
          order={editingOrder ?? undefined}
          initialCustomerId={customerId}
          onClose={() => {
            const restore = editingOrder;
            setEditingOrder(undefined);
            if (restore) setSelectedOrder(restore);
          }}
          onSaved={orderSaved}
        />
      )}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          role={role}
          onClose={() => setSelectedOrder(null)}
          onEdit={editDraft}
          onChanged={(order) => {
            setSelectedOrder(order);
            setOrders((current) => current.map((row) => row.id === order.id ? order : row));
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ label, status }: { label: string; status: OrderStatus }) {
  return <Badge tone={status === 'confirmed' ? 'green' : status === 'cancelled' ? 'red' : 'amber'}>{label}</Badge>;
}

function OrderCard({ order, onOpen }: { order: OrderRow; onOpen: () => void }) {
  const { t } = useLanguage();
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-stone-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="font-bold text-leaf-900">{order.order_number}</p><p className="text-sm text-stone-600">{order.customer?.name ?? '—'} · {order.order_date}</p></div>
        <StatusBadge label={t(statusKey(order.status))} status={order.status} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <p>{t('orders_total')}: <strong>{formatINR(order.total)}</strong></p><p>{t('orders_paid')}: {formatINR(order.paid_amount)}</p>
        <p>{t('orders_balance')}: {formatINR(Math.max(0, order.total - order.paid_amount))}</p>
        <p>{t('orders_payment_status')}: {t(paymentKey(order.payment_status))}</p>
      </div>
    </button>
  );
}
