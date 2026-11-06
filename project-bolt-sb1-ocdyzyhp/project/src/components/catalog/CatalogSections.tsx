import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/Feedback';
import { useLanguage } from '@/hooks/useLanguage';
import { formatINR, formatKg } from '@/lib/format';
import type { ProductRow, RawRow } from '@/types';

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
}

function StockCard({ code, name, detail, stockKg, lowStockLimitKg, prices }: StockCardProps) {
  const { t } = useLanguage();
  const isLow = stockKg <= lowStockLimitKg;

  return (
    <article className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-wide text-leaf-800">{code}</p>
          <h3 className="mt-1 text-lg font-bold leading-snug text-stone-900">{name}</h3>
        </div>
        {isLow ? (
          <Badge tone="red">
            <AlertTriangle className="mr-1 h-4 w-4" aria-hidden />
            {t('low_stock')}
          </Badge>
        ) : (
          <Badge tone="green">{t('in_stock')}</Badge>
        )}
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
}

export function ProductSection({ rows, showPrices }: ProductSectionProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-8">
      {groupByCategory(rows).map(([category, items]) => (
        <section key={category} className="space-y-4">
          <h2 className="text-base font-bold uppercase tracking-wide text-leaf-800">{category}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((row) => (
              <StockCard
                key={row.id}
                code={row.sku}
                name={row.name}
                detail={row.description ?? `${row.pack_size} ${row.pack_unit}`}
                stockKg={row.stock_kg}
                lowStockLimitKg={row.low_stock_limit_kg}
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
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

interface RawSectionProps {
  rows: RawRow[];
  showCost: boolean;
}

export function RawSection({ rows, showCost }: RawSectionProps) {
  const { t } = useLanguage();

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <StockCard
          key={row.id}
          code={row.code}
          name={row.name}
          stockKg={row.stock_kg}
          lowStockLimitKg={row.low_stock_limit_kg}
          prices={
            showCost && row.cost_per_kg !== undefined
              ? [{ label: t('col_cost'), value: formatINR(row.cost_per_kg) }]
              : undefined
          }
        />
      ))}
    </div>
  );
}
