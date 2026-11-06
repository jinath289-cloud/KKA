import { useEffect, useState } from 'react';
import { Package, Sprout, type LucideIcon } from 'lucide-react';
import { ProductSection, RawSection } from '@/components/catalog/CatalogSections';
import { Button } from '@/components/ui/Button';
import { EmptyState, ListSkeleton } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/cn';
import { fetchProductRows, fetchRawRows } from '@/services/catalogService';
import type { ProductRow, RawRow, Role } from '@/types';

type Tab = 'products' | 'raw';

interface CatalogPageProps {
  role: Role;
}

export function CatalogPage({ role }: CatalogPageProps) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('products');
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [raws, setRaws] = useState<RawRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const showPrices = role !== 'store';
  const showCost = role === 'admin' || role === 'purchase';

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    const request =
      tab === 'products'
        ? fetchProductRows(role).then((rows) => {
            if (!cancelled) setProducts(rows);
          })
        : fetchRawRows(role).then((rows) => {
            if (!cancelled) setRaws(rows);
          });
    request.catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, role, attempt]);

  const isLoading = !failed && (tab === 'products' ? products === null : raws === null);
  const retry = () => setAttempt((count) => count + 1);

  const tabs: { key: Tab; label: string; icon: LucideIcon }[] = [
    { key: 'products', label: t('tab_products'), icon: Package },
    { key: 'raw', label: t('tab_raw'), icon: Sprout },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('catalog_title')}
        subtitle={showPrices ? t('catalog_subtitle_prices') : t('catalog_subtitle_stock')}
      />

      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-200/70 p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-base font-semibold transition-all active:scale-[0.98]',
              tab === key ? 'bg-white text-leaf-900 shadow-sm' : 'text-stone-700 hover:text-stone-900',
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {isLoading && <ListSkeleton rows={4} />}

      {failed && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="font-semibold text-red-800">{t('error_generic')}</p>
          <Button variant="outline" onClick={retry}>
            {t('retry')}
          </Button>
        </div>
      )}

      {!isLoading && !failed && tab === 'products' && products && (
        products.length === 0 ? (
          <EmptyState icon={Package} title={t('catalog_empty_products')} />
        ) : (
          <ProductSection rows={products} showPrices={showPrices} />
        )
      )}

      {!isLoading && !failed && tab === 'raw' && raws && (
        raws.length === 0 ? (
          <EmptyState icon={Sprout} title={t('catalog_empty_raw')} />
        ) : (
          <RawSection rows={raws} showCost={showCost} />
        )
      )}
    </div>
  );
}
