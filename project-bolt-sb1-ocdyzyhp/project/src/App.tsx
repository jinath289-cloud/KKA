import { Leaf, Loader2 } from 'lucide-react';
import { LoginPage } from '@/pages/LoginPage';
import { SignedInApp } from '@/components/layout/SignedInApp';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { LanguageProvider } from '@/hooks/useLanguage';
import { ToastProvider } from '@/hooks/useToast';

function AppGate() {
  const { state } = useAuth();

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-leaf-800 text-amber-200">
        <Leaf className="h-12 w-12" aria-hidden />
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      </div>
    );
  }

  if (state.status === 'signed-out') {
    return <LoginPage reason={state.reason} />;
  }

  return <SignedInApp profile={state.profile} />;
}

export default function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <AuthProvider>
          <AppGate />
        </AuthProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}
