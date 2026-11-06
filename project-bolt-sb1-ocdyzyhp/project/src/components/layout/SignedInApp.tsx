import { useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { BottomNav, Sidebar } from '@/components/layout/Navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { useLanguage } from '@/hooks/useLanguage';
import { navItemsFor, type PageKey } from '@/lib/roles';
import { AuditPage } from '@/pages/AuditPage';
import { CatalogPage } from '@/pages/CatalogPage';
import { HomePage } from '@/pages/HomePage';
import { SettingsPage } from '@/pages/SettingsPage';
import type { Profile } from '@/types';

interface SignedInAppProps {
  profile: Profile;
}

export function SignedInApp({ profile }: SignedInAppProps) {
  const { signOut } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const [requestedPage, setRequestedPage] = useState<PageKey>('home');

  const items = navItemsFor(profile.role);
  const page = items.some((item) => item.key === requestedPage) ? requestedPage : 'home';

  const handleSignOut = () => {
    signOut().catch(() => toast.error(t('error_generic')));
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <AppHeader onSignOut={handleSignOut} />
      <Sidebar items={items} active={page} onNavigate={setRequestedPage} />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pl-72 lg:pr-8">
        {page === 'home' && <HomePage profile={profile} onNavigate={setRequestedPage} />}
        {page === 'catalog' && <CatalogPage role={profile.role} />}
        {page === 'settings' && <SettingsPage currentUserId={profile.id} />}
        {page === 'audit' && <AuditPage />}
      </main>
      <BottomNav items={items} active={page} onNavigate={setRequestedPage} />
    </div>
  );
}
