import { Badge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/hooks/useLanguage';
import { ROLE_LABEL } from '@/lib/roles';
import type { Role } from '@/types';

interface DemoAccount {
  role: Role;
  email: string;
  password: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: 'admin', email: 'admin@khagikala.demo', password: 'Admin@123' },
  { role: 'purchase', email: 'purchase@khagikala.demo', password: 'Purchase@123' },
  { role: 'store', email: 'store@khagikala.demo', password: 'Store@123' },
  { role: 'sales', email: 'sales@khagikala.demo', password: 'Sales@123' },
];

interface DemoLoginBoxProps {
  onUse: (email: string, password: string) => void;
}

export function DemoLoginBox({ onUse }: DemoLoginBoxProps) {
  const { t } = useLanguage();

  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-amber-950">{t('demo_login_title')}</h2>
          <p className="mt-1 text-sm text-amber-900">{t('demo_login_note')}</p>
        </div>
        <Badge tone="amber">Demo</Badge>
      </div>
      <ul className="space-y-3">
        {DEMO_ACCOUNTS.map((account) => (
          <li
            key={account.email}
            className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-semibold text-stone-900">{t(ROLE_LABEL[account.role])}</p>
              <p className="break-all text-sm text-stone-600">{account.email}</p>
              <p className="text-sm text-stone-600">
                {t('password')}: <span className="font-mono font-semibold text-stone-800">{account.password}</span>
              </p>
            </div>
            <Button
              variant="outline"
              className="min-h-11 shrink-0 px-4 py-2"
              onClick={() => onUse(account.email, account.password)}
            >
              {t('use_account')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
