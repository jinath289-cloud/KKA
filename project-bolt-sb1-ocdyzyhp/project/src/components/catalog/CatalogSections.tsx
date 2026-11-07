import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Feedback';
import { useLanguage } from '@/hooks/useLanguage';
import { formatINR, formatKg } from '@/lib/format';
import type { MessageKey } from '@/lib/i18n';
import type { ProductRow, RawRow, Role, StockItemOption, VendorRow, VendorType } from '@/types';
import { movementTypesFor, type StockDirection } from '@/lib/stock';

const VENDOR_TYPE_LABELS: Record<VendorType, MessageKey> = {
  farmer: 'catalog_vendor_type_farmer',
  shg: 'catalog_vendor_type_shg',
  local_producer: 'catalog_vendor_type_local_producer',
  trader: 'catalog_vendor_type_trader',
};

interface PriceLine {
  label: string;
  value: string;
}

interface StockCardProps {
  code: string;
  name: string;
  detail?: string;
  stockKg: number;
  lowStockLimitKg: number;
  prices?: PriceLine[];
  isActive: boolean;
  onEdit?: () => void;
  stockActions?: {
    item: StockItemOption;
    role: Role;
    onMove: (item: StockItemOption, direction: StockDirection) => void;
  };
}

function StockCard({ code, name, detail, stockKg, lowStockLimitKg, prices, isActive, onEdit, stockActions }: StockCardProps) {
  const { t } = useLanguage();
  const isLow = stockKg <= lowStockLimitKg;
  const canStockIn = stockActions && movementTypesFor(stockActions.role, stockActions.item.item_type, 'in').length > 0;
  const canStockOut = stockActions && movementTypesFor(stockActions.role, stockActions.item.item_type, 'out').length > 0;

  return (
    <article className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-wide text-leaf-800">{code}</p>
          <h3 className="mt-1 text-lg font-bold leading-snug text-stone-900">{name}</h3>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {!isActive && <Badge tone="red">{t('catalog_inactive')}</Badge>}
          {isLow ? (
            <Badge tone="amber">
              <AlertTriangle className="mr-1 h-4 w-4" aria-hidden />
              {t('low_stock')}
            </Badge>
          ) : (
            <Badge tone="green">{t('in_stock')}</Badge>
          )}
        </div>
      </div>

      {detail && <p className="text-base text-stone-600">{detail}</p>}

      {prices && prices.length > 0 && (
        <dl className="grid grid-cols-2 gap-3">
          {prices.map((price) => (
            <div key={price.label} className="rounded-xl bg-amber-50 p-3">
              <dt className="text-sm text-stone-700">{price.label}</dt>
              <dd className="mt-1 text-lg font-bold text-stone-900">{price.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex items-center justify-between border-t border-stone-100 pt-3 text-base">
        <span className="text-stone-600">{t('stock_label')}</span>
        <span className={isLow ? 'font-bold text-red-700' : 'font-bold text-stone-900'}>
          {formatKg(stockKg)}
        </span>
      </div>
      {onEdit && (
        <Button variant="outline" onClick={onEdit} aria-label={`${t('catalog_edit')} ${name}`}>
          {t('catalog_edit')}
        </Button>
      )}
      {stockActions && (canStockIn || canStockOut) && (
        <div className="grid grid-cols-2 gap-3">
          {canStockIn ? (
            <Button variant="secondary" onClick={() => stockActions.onMove(stockActions.item, 'in')}>
              {t('stock_in_button')}
            </Button>
          ) : <span />}
          {canStockOut ? (
            <Button variant="outline" onClick={() => stockActions.onMove(stockActions.item, 'out')}>
              {t('stock_out_button')}
            </Button>
          ) : <span />}
        </div>
      )}
    </article>
  );
}

function groupByCategory(rows: ProductRow[]): [string, ProductRow[]][] {
  const groups = new Map<string, ProductRow[]>();
  for (const row of rows) {
    groups.set(row.category, [...(groups.get(row.category) ?? []), row]);
  }
  return [...groups.entries()];
}

interface ProductSectionProps {
  rows: ProductRow[];
  showPrices: boolean;
  canEdit: boolean;
  onEdit: (row: ProductRow) => void;
  role: Role;
  onStockMovement: (item: StockItemOption, direction: StockDirection) => void;
}

export function ProductSection({ rows, showPrices, canEdit, onEdit, role, onStockMovement }: ProductSectionProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-8">
      {groupByCategory(rows).map(([category, items]) => (
        <section key={category} className="space-y-4">
          <h2 className="text-base font-bold uppercase tracking-wide text-leaf-800">{category}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((row) => {
              const isActive = row.is_active !== false;
              return <StockCard
                key={row.id}
                code={row.sku}
                name={row.name}
                detail={row.description ?? `${row.pack_size} ${row.pack_unit}`}
                stockKg={row.stock_kg}
                lowStockLimitKg={row.low_stock_limit_kg}
                isActive={isActive}
                onEdit={canEdit ? () => onEdit(row) : undefined}
                stockActions={!isActive ? undefined : {
                  role,
                  item: {
                    id: row.id,
                    item_type: 'product',
                    code: row.sku,
                    name: row.name,
                    stock_kg: row.stock_kg,
                    low_stock_limit_kg: row.low_stock_limit_kg,
                    is_active: isActive,
                  },
                  onMove: onStockMovement,
                }}
                prices={
                  showPrices && row.retail_price !== undefined && row.wholesale_price !== undefined
                    ? [
                        {
                          label: `${t('col_retail')} · ${row.pack_size} ${row.pack_unit}`,
                          value: formatINR(row.retail_price),
                        },
                        { label: t('col_wholesale'), value: formatINR(row.wholesale_price) },
                      ]
                    : undefined
                }
              />;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

interface RawSectionProps {
  rows: RawRow[];
  showCost: boolean;
  canEdit: boolean;
  onEdit: (row: RawRow) => void;
  role: Role;
  onStockMovement: (item: StockItemOption, direction: StockDirection) => void;
}

export function RawSection({ rows, showCost, canEdit, onEdit, role, onStockMovement }: RawSectionProps) {
  const { t } = useLanguage();

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => {
        const isActive = row.is_active !== false;
        return <StockCard
          key={row.id}
          code={row.code}
          name={row.name}
          stockKg={row.stock_kg}
          lowStockLimitKg={row.low_stock_limit_kg}
          isActive={isActive}
          onEdit={canEdit ? () => onEdit(row) : undefined}
          stockActions={!isActive ? undefined : {
            role,
            item: {
              id: row.id,
              item_type: 'raw_material',
              code: row.code,
              name: row.name,
              stock_kg: row.stock_kg,
              low_stock_limit_kg: row.low_stock_limit_kg,
              is_active: isActive,
            },
            onMove: onStockMovement,
          }}
          prices={
            showCost && row.cost_per_kg !== undefined
              ? [{ label: t('col_cost'), value: formatINR(row.cost_per_kg) }]
              : undefined
          }
        />;
      })}
    </div>
  );
}

interface VendorSectionProps {
  rows: VendorRow[];
  canEdit: boolean;
  onEdit: (row: VendorRow) => void;
}

export function VendorSection({ rows, canEdit, onEdit }: VendorSectionProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      {rows.map((vendor) => (
        <article key={vendor.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-stone-900">{vendor.name}</h3>
                <Badge tone="amber">{t(VENDOR_TYPE_LABELS[vendor.vendor_type])}</Badge>
                {vendor.is_id_verified && <Badge tone="green">{t('catalog_verified')}</Badge>}
                {!vendor.is_active && <Badge tone="red">{t('catalog_inactive')}</Badge>}
              </div>
              <p className="text-base text-stone-700">{vendor.contact_person} · {vendor.phone}</p>
              <p className="text-sm text-stone-600">{vendor.village_cluster}</p>
              {vendor.address && <p className="text-sm text-stone-600">{vendor.address}</p>}
              {vendor.upi_id && <p className="text-sm text-stone-600">{t('catalog_upi')}: {vendor.upi_id}</p>}
              <p className="text-sm text-stone-600">
                {t('catalog_supplies')}: {vendor.supplies.length > 0 ? vendor.supplies.join(', ') : t('catalog_none')}
              </p>
            </div>
            {canEdit && (
              <Button variant="outline" onClick={() => onEdit(vendor)} aria-label={`${t('catalog_edit')} ${vendor.name}`}>
                {t('catalog_edit')}
              </Button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
