import { useCallback, useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState, ListSkeleton, Badge } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { useLanguage } from '@/hooks/useLanguage';
import { formatDateTime } from '@/lib/format';
import type { MessageKey } from '@/lib/i18n';
import { ROLE_LABEL } from '@/lib/roles';
import { listAuditEntries } from '@/services/userService';
import { ROLES, type AuditEntry, type Role } from '@/types';

const PAGE_SIZE = 20;

const ACTION_LABELS: Record<string, MessageKey> = {
  user_created: 'action_user_created',
  role_changed: 'action_role_changed',
  account_activated: 'action_account_activated',
  account_deactivated: 'action_account_deactivated',
  price_changed: 'action_price_changed',
};

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function AuditPage() {
  const { t, lang } = useLanguage();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadPage = useCallback(async (from: number) => {
    setLoadFailed(false);
    try {
      const page = await listAuditEntries(from, from + PAGE_SIZE - 1);
      setEntries((current) => (from === 0 ? page : [...(current ?? []), ...page]));
      setHasMore(page.length === PAGE_SIZE);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadPage(0);
  }, [loadPage]);

  const loadMore = () => {
    setLoadingMore(true);
    void loadPage(entries?.length ?? 0);
  };

  const describeDetail = (entry: AuditEntry): string | null => {
    if (entry.action === 'role_changed') {
      const from = entry.old_values?.role;
      const to = entry.new_values?.role;
      if (!isRole(from) || !isRole(to)) return null;
      return t('from_to').replace('{0}', t(ROLE_LABEL[from])).replace('{1}', t(ROLE_LABEL[to]));
    }
    if (entry.action === 'user_created' && typeof entry.new_values?.email === 'string') {
      return entry.new_values.email;
    }
    if (entry.action === 'price_changed' && typeof entry.new_values?.sku === 'string') {
      return entry.new_values.sku;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('audit_title')} subtitle={t('audit_subtitle')} />

      {entries === null && !loadFailed && <ListSkeleton />}

      {loadFailed && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="font-semibold text-red-800">{t('error_generic')}</p>
          <Button variant="outline" onClick={() => void loadPage(0)}>
            {t('retry')}
          </Button>
        </div>
      )}

      {entries?.length === 0 && <EmptyState icon={ScrollText} title={t('audit_empty')} />}

      {entries && entries.length > 0 && (
        <ul className="space-y-3">
          {entries.map((entry) => {
            const detail = describeDetail(entry);
            return (
              <li key={entry.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-bold text-stone-900">
                    {t(ACTION_LABELS[entry.action] ?? 'action_other')}
                  </p>
                  <Badge tone="stone">{formatDateTime(entry.created_at, lang)}</Badge>
                </div>
                {detail && <p className="mt-2 text-base text-stone-700">{detail}</p>}
                <p className="mt-2 text-sm text-stone-500">
                  {t('col_who')}: {entry.actor?.full_name ?? t('system_actor')}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} loading={loadingMore}>
            {t('load_more')}
          </Button>
        </div>
      )}
    </div>
  );
}
