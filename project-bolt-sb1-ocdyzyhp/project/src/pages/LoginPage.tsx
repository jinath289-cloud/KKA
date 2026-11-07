import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { useLanguage } from '@/hooks/useLanguage';
import { useToast } from '@/hooks/useToast';
import type { SignedOutReason } from '@/hooks/useAuth';
import type { MessageKey } from '@/lib/i18n';
import { signInWithPassword } from '@/services/authService';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginPageProps {
  reason?: SignedOutReason;
}

interface FormErrors {
  email?: string;
  password?: string;
}

function describeSignInError(error: unknown): MessageKey {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Invalid login credentials')) return 'err_invalid_credentials';
  if (/fetch|network/i.test(message)) return 'error_network';
  return 'error_generic';
}

export function LoginPage({ reason }: LoginPageProps) {
  const { t } = useLanguage();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!EMAIL_PATTERN.test(email.trim())) next.email = t('err_invalid_email');
    if (!password) next.password = t('required_field');
    return next;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await signInWithPassword(email.trim(), password);
    } catch (error) {
      toast.error(t(describeSignInError(error)));
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <AppHeader />
      <main className="mx-auto max-w-md space-y-6 px-4 py-8 sm:py-12">
        {reason && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-800">
            {t(reason === 'inactive' ? 'err_inactive' : 'err_load_failed')}
          </div>
        )}

        <section className="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-stone-200 sm:p-8">
          <h2 className="text-2xl font-bold text-stone-900">{t('sign_in_title')}</h2>
          <p className="mt-2 text-base text-stone-600">{t('sign_in_subtitle')}</p>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
            <TextField
              label={t('email')}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={errors.email}
              placeholder="name@example.com"
            />

            <div className="space-y-2">
              <TextField
                label={t('password')}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={errors.password}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="ml-auto flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-leaf-800 transition-colors hover:text-leaf-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                <span>{showPassword ? t('hide_password') : t('show_password')}</span>
              </button>
            </div>

            <Button type="submit" fullWidth loading={submitting}>
              {submitting ? t('logging_in') : t('login_button')}
            </Button>
          </form>
        </section>

      </main>
    </div>
  );
}
