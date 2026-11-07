import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Pencil, Plus, UserRound } from 'lucide-react';
import { CustomerEditorModal } from '@/components/orders/CustomerEditorModal';
import { Button } from '@/components/ui/Button';
import { EmptyState, ListSkeleton, Badge } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { useLanguage } from '@/hooks/useLanguage';
import { useToast } from '@/hooks/useToast';
import { formatINR } from '@/lib/format';
import { getCustomerBalances, listCustomers, setCustomerActive } from '@/services/customerService';
import type { CustomerBalance, CustomerRow } from '@/types';

interface CustomersPageProps {
  onViewOrders: (customerId: string) => void;
}

export function CustomersPage({ onViewOrders }: CustomersPageProps) {
  const { t } = useLanguage();
  const toast = useToast();
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [balances, setBalances] = useState<CustomerBalance[]>([]);
  const [search, setSearch] = useState('');
  const [editorCustomer, setEditorCustomer] = useState<CustomerRow | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [customerRows, balanceRows] = await Promise.all([listCustomers(search), getCustomerBalances()]);
      setCustomers(customerRows);
      setBalances(balanceRows);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void reload();
  }, [reload, attempt]);

  const balanceByCustomer = useMemo(() => new Map(balances.map((row) => [row.customer_id, row])), [balances]);

  const toggleActive = async (customer: CustomerRow) => {
    const active = !customer.is_active;
    if (customer.is_active && !window.confirm(t('orders_confirm_deactivate_customer'))) return;
    setWorkingId(customer.id);
    try {
      await setCustomerActive(customer.id, active);
      toast.success(t(active ? 'orders_customer_reactivated' : 'orders_customer_deactivated'));
      await reload();
    } catch {
      toast.error(t('orders_error_permission'));
    } finally {
      setWorkingId(null);
    }
  };

  const saveCustomer = async (saved: CustomerRow) => {
    setEditorCustomer(undefined);
    toast.success(t('orders_customer_saved'));
    await reload();
    if (!customers?.some((customer) => customer.id === saved.id)) {
      setSearch(saved.name);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('customers_title')}
        subtitle={t('customers_subtitle')}
        action={<Button onClick={() => setEditorCustomer(null)}><Plus className="h-5 w-5" aria-hidden />{t('orders_add_customer')}</Button>}
      />
      <TextField label={t('customers_search')} value={search} onChange={(event) => setSearch(event.target.value)} />

      {loading && <ListSkeleton rows={4} />}
      {failed && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p role="alert" className="font-semibold text-red-800">{t('error_generic')}</p>
          <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t('retry')}</Button>
        </div>
      )}
      {!loading && !failed && customers?.length === 0 && <EmptyState icon={UserRound} title={t('customers_empty')} />}
      {!loading && !failed && customers && customers.length > 0 && (
        <ul className="grid gap-3 lg:grid-cols-2">
          {customers.map((customer) => {
            const balance = balanceByCustomer.get(customer.id);
            return (
              <li key={customer.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button type="button" onClick={() => onViewOrders(customer.id)} className="min-h-11 text-left text-lg font-bold text-leaf-900 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300">
                      {customer.name}
                    </button>
                    <p className="text-sm text-stone-600">{customer.phone ?? '—'}{customer.city_village ? ` · ${customer.city_village}` : ''}</p>
                    {customer.gstin && <p className="mt-1 text-sm text-stone-600">{t('orders_gstin')}: {customer.gstin}</p>}
                  </div>
                  {!customer.is_active && <Badge tone="red">{t('status_inactive')}</Badge>}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
                  <p className="text-sm text-stone-600">{t('customers_outstanding')}: <strong className={balance && balance.outstanding > 0 ? 'text-red-700' : 'text-stone-900'}>{formatINR(balance?.outstanding ?? 0)}</strong></p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => onViewOrders(customer.id)}><ArrowRight className="h-5 w-5" aria-hidden />{t('customers_view_orders')}</Button>
                    <Button variant="outline" onClick={() => setEditorCustomer(customer)}><Pencil className="h-5 w-5" aria-hidden />{t('catalog_edit')}</Button>
                    <Button variant={customer.is_active ? 'danger' : 'secondary'} loading={workingId === customer.id} onClick={() => void toggleActive(customer)}>
                      {t(customer.is_active ? 'deactivate' : 'activate')}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editorCustomer !== undefined && (
        <CustomerEditorModal
          customer={editorCustomer ?? undefined}
          onClose={() => setEditorCustomer(undefined)}
          onSaved={(saved) => void saveCustomer(saved)}
        />
      )}
    </div>
  );
}
