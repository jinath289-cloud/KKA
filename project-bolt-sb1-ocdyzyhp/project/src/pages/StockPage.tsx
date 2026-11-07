import { useEffect, useMemo, useState } from 'react';
import { Download, Package, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState, ListSkeleton } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectField, TextField } from '@/components/ui/Field';
import { useLanguage } from '@/hooks/useLanguage';
import { formatDateTime, formatKg } from '@/lib/format';
import { movementDelta, movementLabelKey, visibleMovementTypes } from '@/lib/stock';
import { fetchAllFilteredStockMovements, fetchStockItems, fetchStockMovements } from '@/services/stockService';
import type { Role, StockItemOption, StockItemType, StockMovement, StockMovementType } from '@/types';

const PAGE_SIZE = 25;

interface StockPageProps {
  role: Role;
}

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function StockPage({ role }: StockPageProps) {
  const { t, lang } = useLanguage();
  const [items, setItems] = useState<StockItemOption[] | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [itemId, setItemId] = useState('');
  const [itemType, setItemType] = useState<StockItemType | ''>('');
  const [movementType, setMovementType] = useState<StockMovementType | ''>('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [itemsFailed, setItemsFailed] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchStockItems(role)
      .then((rows) => {
        if (!cancelled) {
          setItems(rows);
          setItemsFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItemsFailed(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [role, attempt]);

  useEffect(() => {
    if (items === null) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchStockMovements({
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      itemId: itemId || undefined,
      itemType: itemType || undefined,
      movementType: movementType || undefined,
      from: page * PAGE_SIZE,
      to: page * PAGE_SIZE + PAGE_SIZE,
    })
      .then((rows) => {
        if (cancelled) return;
        setHasMore(rows.length > PAGE_SIZE);
        setMovements(rows.slice(0, PAGE_SIZE));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, items, fromDate, toDate, itemId, itemType, movementType, page, attempt]);

  const itemById = useMemo(
    () => new Map((items ?? []).map((item) => [`${item.item_type}:${item.id}`, item])),
    [items],
  );
  const visibleTypes = visibleMovementTypes(role);

  const exportCsv = async () => {
    setExporting(true);
    try {
      setExportFailed(false);
      const allRows = await fetchAllFilteredStockMovements({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        itemId: itemId || undefined,
        itemType: itemType || undefined,
        movementType: movementType || undefined,
      });
      const header = [
        t('stock_date'),
        t('stock_item'),
        t('stock_movement_type'),
        t('stock_quantity'),
        t('stock_balance'),
        t('stock_vendor'),
        t('stock_note'),
      ];
      const lines = [
        header.map(csvCell).join(','),
        ...allRows.map((row) => {
          const item = itemById.get(`${row.item_type}:${row.item_id}`);
          const vendor = Array.isArray(row.vendor) ? row.vendor[0]?.name : row.vendor?.name;
          const quantity = movementDelta(row.movement_type, row.quantity_kg);
          return [
            formatDateTime(row.created_at, lang),
            item ? `${item.code} ${item.name}` : row.item_id,
            t(movementLabelKey(row.movement_type)),
            `${quantity > 0 ? '+' : ''}${formatKg(quantity)}`,
            formatKg(row.balance_after_kg),
            vendor ?? '',
            row.note ?? '',
          ].map(csvCell).join(',');
        }),
      ];
      const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'stock-movements.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportFailed(true);
    } finally {
      setExporting(false);
    }
  };

  const updateFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(0);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('stock_page_title')}
        subtitle={t('stock_page_subtitle')}
        action={
          <Button variant="outline" onClick={() => void exportCsv()} loading={exporting} disabled={loading || items === null}>
            <Download className="h-5 w-5" aria-hidden />
            {t('stock_export_csv')}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField label={t('stock_from_date')} type="date" value={fromDate} onChange={(event) => updateFilter(setFromDate)(event.target.value)} />
        <TextField label={t('stock_to_date')} type="date" value={toDate} onChange={(event) => updateFilter(setToDate)(event.target.value)} />
        <SelectField
          label={t('stock_filter_item')}
          value={itemType && itemId ? `${itemType}:${itemId}` : ''}
          onChange={(event) => {
            const [type, id] = event.target.value.split(':');
            setItemType(type === 'product' || type === 'raw_material' ? type : '');
            setItemId(id ?? '');
            setPage(0);
          }}
        >
          <option value="">{t('stock_all_items')}</option>
          {(items ?? []).map((item) => (
            <option key={`${item.item_type}:${item.id}`} value={`${item.item_type}:${item.id}`}>
              {item.item_type === 'product' ? t('stock_product') : t('stock_raw_material')}: {item.code} · {item.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('stock_filter_type')}
          value={movementType}
          onChange={(event) => {
            setMovementType(event.target.value as StockMovementType | '');
            setPage(0);
          }}
        >
          <option value="">{t('stock_all_types')}</option>
          {visibleTypes.map((type) => <option key={type} value={type}>{t(movementLabelKey(type))}</option>)}
        </SelectField>
      </div>

      {itemsFailed && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p role="alert" className="font-semibold text-red-800">{t('error_generic')}</p>
          <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t('retry')}</Button>
        </div>
      )}
      {exportFailed && <p role="alert" className="rounded-xl bg-red-50 p-4 font-semibold text-red-800">{t('stock_error_export')}</p>}
      {loading && <ListSkeleton rows={5} />}
      {failed && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="font-semibold text-red-800">{t('error_generic')}</p>
          <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t('retry')}</Button>
        </div>
      )}
      {!loading && !failed && movements.length === 0 && (
        <EmptyState icon={Package} title={t('stock_empty')} />
      )}
      {!loading && !failed && movements.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
            <table className="min-w-[850px] w-full border-collapse text-left text-sm">
              <thead className="bg-stone-100 text-stone-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">{t('stock_date')}</th>
                  <th className="px-4 py-3 font-semibold">{t('stock_item')}</th>
                  <th className="px-4 py-3 font-semibold">{t('stock_movement_type')}</th>
                  <th className="px-4 py-3 font-semibold">{t('stock_quantity')}</th>
                  <th className="px-4 py-3 font-semibold">{t('stock_balance')}</th>
                  <th className="px-4 py-3 font-semibold">{t('stock_vendor')}</th>
                  <th className="px-4 py-3 font-semibold">{t('stock_note')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {movements.map((movement) => {
                  const item = itemById.get(`${movement.item_type}:${movement.item_id}`);
                  const delta = movementDelta(movement.movement_type, movement.quantity_kg);
                  const isLow = item !== undefined && movement.balance_after_kg <= item.low_stock_limit_kg;
                  const vendor = Array.isArray(movement.vendor) ? movement.vendor[0]?.name : movement.vendor?.name;
                  return (
                    <tr key={movement.id} className={isLow ? 'bg-red-50' : undefined}>
                      <td className="whitespace-nowrap px-4 py-3">{formatDateTime(movement.created_at, lang)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {movement.item_type === 'product' ? <Package className="h-4 w-4 text-leaf-700" aria-hidden /> : <Sprout className="h-4 w-4 text-leaf-700" aria-hidden />}
                          <span>{item ? `${item.code} · ${item.name}` : movement.item_id}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{t(movementLabelKey(movement.movement_type))}</td>
                      <td className={`whitespace-nowrap px-4 py-3 font-semibold ${delta < 0 ? 'text-red-700' : 'text-leaf-800'}`}>
                        {delta > 0 ? '+' : ''}{formatKg(delta)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{formatKg(movement.balance_after_kg)}</td>
                      <td className="px-4 py-3">{vendor ?? '—'}</td>
                      <td className="max-w-xs px-4 py-3">{movement.note ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
              {t('stock_previous')}
            </Button>
            <span className="text-sm font-semibold text-stone-600">{t('stock_page_number').replace('{0}', String(page + 1))}</span>
            <Button variant="outline" disabled={!hasMore} onClick={() => setPage((value) => value + 1)}>
              {t('stock_next')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
