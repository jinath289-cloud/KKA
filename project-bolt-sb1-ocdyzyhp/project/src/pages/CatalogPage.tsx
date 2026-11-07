import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Package, Sprout, Store, type LucideIcon } from 'lucide-react';
import { CatalogEditorModal } from '@/components/catalog/CatalogEditorModal';
import { ProductSection, RawSection, VendorSection } from '@/components/catalog/CatalogSections';
import { Button } from '@/components/ui/Button';
import { EmptyState, ListSkeleton } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectField, TextField } from '@/components/ui/Field';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/cn';
import { fetchProductRows, fetchRawRows } from '@/services/catalogService';
import { fetchVendorRows } from '@/services/vendorService';
import type { ProductRow, RawRow, Role, VendorRow } from '@/types';

type Tab = 'products' | 'raw' | 'vendors';
type EditorKind = 'product' | 'raw' | 'vendor';
type EditorState =
  | { kind: 'product'; record?: ProductRow }
  | { kind: 'raw'; record?: RawRow }
  | { kind: 'vendor'; record?: VendorRow }
  | null;

interface CatalogPageProps {
  role: Role;
}

interface AddMenuProps {
  role: Role;
  onAdd: (kind: EditorKind) => void;
}

function CatalogAddMenu({ role, onAdd }: AddMenuProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = 'catalog-add-menu';
  const options: { kind: EditorKind; label: string }[] =
    role === 'admin'
      ? [
          { kind: 'product', label: t('catalog_add_product') },
          { kind: 'raw', label: t('catalog_add_raw') },
          { kind: 'vendor', label: t('catalog_add_vendor') },
        ]
      : [{ kind: 'vendor', label: t('catalog_add_vendor') }];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const focusItem = (index: number) => {
    itemRefs.current[index]?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem((currentIndex + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem((currentIndex - 1 + options.length) % options.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(options.length - 1);
    }
  };

  const openMenu = () => {
    setOpen(true);
    window.requestAnimationFrame(() => focusItem(0));
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            openMenu();
          } else if (event.key === 'Escape' && open) {
            setOpen(false);
          }
        }}
      >
        {t('catalog_add')}
        <ChevronDown className="h-4 w-4" aria-hidden />
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('catalog_add')}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 z-30 mt-2 min-w-52 overflow-hidden rounded-xl border border-stone-200 bg-white p-1 shadow-xl"
        >
          {options.map((option, index) => (
            <button
              key={option.kind}
              ref={(element) => { itemRefs.current[index] = element; }}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onAdd(option.kind);
              }}
              className="flex min-h-12 w-full items-center rounded-lg px-4 py-2 text-left text-base font-semibold text-stone-800 hover:bg-leaf-50 focus:bg-leaf-50 focus:outline-none"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CatalogPage({ role }: CatalogPageProps) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('products');
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [raws, setRaws] = useState<RawRow[] | null>(null);
  const [vendors, setVendors] = useState<VendorRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);

  const showPrices = role !== 'store';
  const showCost = role === 'admin' || role === 'purchase';
  const canEditMasterData = role === 'admin';
  const canEditVendors = role === 'admin' || role === 'purchase';
  const canSeeVendors = canEditVendors;

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setLoading(true);
    const request = async () => {
      try {
        if (tab === 'products') {
          const rows = await fetchProductRows(role, role === 'admin' && showInactive);
          if (!cancelled) setProducts(rows);
        } else if (tab === 'raw') {
          const rows = await fetchRawRows(role, role === 'admin' && showInactive);
          if (!cancelled) setRaws(rows);
        } else if (canSeeVendors) {
          const rows = await fetchVendorRows(role, role === 'admin' && showInactive);
          if (!cancelled) setVendors(rows);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void request();
    return () => {
      cancelled = true;
    };
  }, [tab, role, attempt, showInactive, canSeeVendors]);

  const categories = [...new Set((products ?? []).map((row) => row.category))].sort((a, b) => a.localeCompare(b));
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleProducts = (products ?? []).filter((row) =>
    (!category || row.category === category) &&
    (!normalizedSearch || `${row.sku} ${row.name} ${row.category} ${row.description ?? ''}`.toLocaleLowerCase().includes(normalizedSearch)),
  );
  const visibleRaws = (raws ?? []).filter((row) =>
    !normalizedSearch || `${row.code} ${row.name}`.toLocaleLowerCase().includes(normalizedSearch),
  );
  const visibleVendors = (vendors ?? []).filter((row) =>
    !normalizedSearch ||
    `${row.name} ${row.vendor_type} ${row.contact_person} ${row.phone} ${row.village_cluster} ${row.address ?? ''} ${row.upi_id ?? ''} ${row.supplies.join(' ')}`
      .toLocaleLowerCase()
      .includes(normalizedSearch),
  );
  const isEmpty = tab === 'products'
    ? visibleProducts.length === 0
    : tab === 'raw'
      ? visibleRaws.length === 0
      : visibleVendors.length === 0;

  const tabs: { key: Tab; label: string; icon: LucideIcon }[] = [
    { key: 'products', label: t('tab_products'), icon: Package },
    { key: 'raw', label: t('tab_raw'), icon: Sprout },
    ...(canSeeVendors ? [{ key: 'vendors' as const, label: t('tab_vendors'), icon: Store }] : []),
  ];

  const openEditor = (kind: EditorKind) => {
    if (kind === 'product') setEditor({ kind });
    else if (kind === 'raw') setEditor({ kind });
    else setEditor({ kind });
  };

  const retry = () => setAttempt((count) => count + 1);
  const refreshAfterSave = () => setAttempt((count) => count + 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('catalog_title')}
        subtitle={showPrices ? t('catalog_subtitle_prices') : t('catalog_subtitle_stock')}
        action={(role === 'admin' || role === 'purchase') ? <CatalogAddMenu role={role} onAdd={(kind) => openEditor(kind)} /> : undefined}
      />

      <div role="tablist" className={cn('grid gap-1 rounded-2xl bg-stone-200/70 p-1', tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold transition-all active:scale-[0.98] sm:px-3 sm:text-base',
              tab === key ? 'bg-white text-leaf-900 shadow-sm' : 'text-stone-700 hover:text-stone-900',
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.5fr)]">
        <TextField label={t('catalog_search')} value={search} onChange={(event) => setSearch(event.target.value)} />
        {tab === 'products' && (
          <SelectField label={t('catalog_filter_category')} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">{t('catalog_all_categories')}</option>
            {categories.map((value) => <option key={value} value={value}>{value}</option>)}
          </SelectField>
        )}
      </div>

      {role === 'admin' && (
        <button
          type="button"
          role="switch"
          aria-checked={showInactive}
          onClick={() => setShowInactive((value) => !value)}
          className="flex min-h-12 items-center gap-3 rounded-xl px-2 text-left text-base font-semibold text-stone-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
        >
          <span className={`relative inline-flex h-7 w-12 items-center rounded-full ${showInactive ? 'bg-leaf-700' : 'bg-stone-300'}`}>
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${showInactive ? 'translate-x-6' : 'translate-x-1'}`} />
          </span>
          {t('catalog_show_inactive')}
        </button>
      )}

      {loading && <ListSkeleton rows={4} />}

      {failed && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="font-semibold text-red-800">{t('error_generic')}</p>
          <Button variant="outline" onClick={retry}>{t('retry')}</Button>
        </div>
      )}

      {!loading && !failed && isEmpty && (
        <EmptyState
          icon={tab === 'products' ? Package : tab === 'raw' ? Sprout : Store}
          title={search || category
            ? t('catalog_no_results')
            : tab === 'products'
              ? t('catalog_empty_products')
              : tab === 'raw'
                ? t('catalog_empty_raw')
                : t('catalog_empty_vendors')}
        />
      )}
      {!loading && !failed && tab === 'products' && !isEmpty && products && (
        <ProductSection rows={visibleProducts} showPrices={showPrices} canEdit={canEditMasterData} onEdit={(record) => setEditor({ kind: 'product', record })} />
      )}
      {!loading && !failed && tab === 'raw' && !isEmpty && raws && (
        <RawSection rows={visibleRaws} showCost={showCost} canEdit={canEditMasterData} onEdit={(record) => setEditor({ kind: 'raw', record })} />
      )}
      {!loading && !failed && tab === 'vendors' && !isEmpty && vendors && (
        <VendorSection rows={visibleVendors} canEdit={canEditVendors} onEdit={(record) => setEditor({ kind: 'vendor', record })} />
      )}

      {editor?.kind === 'product' && (
        <CatalogEditorModal key={`product-${editor.record?.id ?? 'new'}`} kind="product" record={editor.record} categories={categories} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />
      )}
      {editor?.kind === 'raw' && (
        <CatalogEditorModal key={`raw-${editor.record?.id ?? 'new'}`} kind="raw" record={editor.record} categories={categories} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />
      )}
      {editor?.kind === 'vendor' && (
        <CatalogEditorModal key={`vendor-${editor.record?.id ?? 'new'}`} kind="vendor" record={editor.record} categories={categories} onClose={() => setEditor(null)} onSaved={refreshAfterSave} />
      )}
    </div>
  );
}
