import { useEffect, useState } from 'react';
import { EyeOff, Eye } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/cn';
import { fetchDemoLoginVisible } from '@/services/authService';
import { setDemoLoginVisible } from '@/services/userService';

export function DemoLoginSetting() {
  const { t } = useLanguage();
  const toast = useToast();
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    fetchDemoLoginVisible()
      .then(setVisible)
      .catch(() => toast.error(t('error_generic')));
  }, [t, toast]);

  const toggle = async () => {
    if (visible === null) return;
    const next = !visible;
    setVisible(next);
    try {
      await setDemoLoginVisible(next);
      toast.success(t('success_saved'));
    } catch {
      setVisible(!next);
      toast.error(t('error_generic'));
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-900">
          {visible === false ? <EyeOff className="h-6 w-6" aria-hidden /> : <Eye className="h-6 w-6" aria-hidden />}
        </div>
        <div>
          <h3 className="text-lg font-bold text-stone-900">{t('demo_setting_title')}</h3>
          <p className="text-base text-stone-600">{t('demo_setting_desc')}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={visible === true}
        aria-label={t('demo_setting_title')}
        disabled={visible === null}
        onClick={toggle}
        className="flex min-h-12 shrink-0 items-center gap-3 self-start rounded-full px-1 py-1 disabled:opacity-50 sm:self-center"
      >
        <span
          className={cn(
            'relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200',
            visible ? 'bg-leaf-700' : 'bg-stone-300',
          )}
        >
          <span
            className={cn(
              'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
              visible ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </span>
        <span className="text-base font-semibold text-stone-800">
          {visible ? t('demo_visible') : t('demo_hidden')}
        </span>
      </button>
    </section>
  );
}
