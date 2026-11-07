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
import { StockPage } from '@/pages/StockPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { CustomersPage } from '@/pages/CustomersPage';
import type { Profile } from '@/types';

interface SignedInAppProps {
  profile: Profile;
}

export function SignedInApp({ profile }: SignedInAppProps) {
  const { signOut } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const [requestedPage, setRequestedPage] = useState<PageKey>('home');
  const [ordersCustomerId, setOrdersCustomerId] = useState<string | undefined>();

  const items = navItemsFor(profile.role);
  const page = items.some((item) => item.key === requestedPage) ? requestedPage : 'home';

  const handleSignOut = () => {
    signOut().catch(() => toast.error(t('error_generic')));
  };
  const navigate = (nextPage: PageKey) => {
    if (nextPage === 'orders') setOrdersCustomerId(undefined);
    setRequestedPage(nextPage);
  };
  const viewCustomerOrders = (customerId: string) => {
    setOrdersCustomerId(customerId);
    setRequestedPage('orders');
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <AppHeader onSignOut={handleSignOut} />
      <Sidebar items={items} active={page} onNavigate={navigate} />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pl-72 lg:pr-8">
        {page === 'home' && <HomePage profile={profile} onNavigate={setRequestedPage} />}
        {page === 'catalog' && <CatalogPage role={profile.role} />}
        {page === 'stock' && <StockPage key={profile.role} role={profile.role} />}
        {(page === 'orders' || page === 'customers') && (profile.role === 'admin' || profile.role === 'sales') && (
          <>
            {page === 'orders' && <OrdersPage key={`orders-${ordersCustomerId ?? 'all'}`} role={profile.role} customerId={ordersCustomerId} />}
            {page === 'customers' && <CustomersPage onViewOrders={viewCustomerOrders} />}
          </>
        )}
        {page === 'settings' && <SettingsPage currentUserId={profile.id} />}
        {page === 'audit' && <AuditPage />}
      </main>
      <BottomNav items={items} active={page} onNavigate={navigate} />
    </div>
  );
}
