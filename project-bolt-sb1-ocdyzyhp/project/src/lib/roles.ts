import type { LucideIcon } from 'lucide-react';
import { Home, Package, ScrollText, Settings, Sprout, ShoppingBag, Receipt, Wallet, ArrowLeftRight, Users, ClipboardList } from 'lucide-react';
import type { MessageKey } from '@/lib/i18n';
import type { Role } from '@/types';

export type PageKey = 'home' | 'catalog' | 'stock' | 'orders' | 'customers' | 'settings' | 'audit';

export interface NavItem {
  key: PageKey;
  icon: LucideIcon;
  label: MessageKey;
}

export interface RoleModule {
  icon: LucideIcon;
  title: MessageKey;
  description: MessageKey;
}

const ALL_NAV: Record<PageKey, NavItem> = {
  home: { key: 'home', icon: Home, label: 'nav_home' },
  catalog: { key: 'catalog', icon: Package, label: 'nav_catalog' },
  stock: { key: 'stock', icon: ArrowLeftRight, label: 'nav_stock' },
  orders: { key: 'orders', icon: ClipboardList, label: 'nav_orders' },
  customers: { key: 'customers', icon: Users, label: 'nav_customers' },
  settings: { key: 'settings', icon: Settings, label: 'nav_settings' },
  audit: { key: 'audit', icon: ScrollText, label: 'nav_audit' },
};

const NAV_KEYS_BY_ROLE: Record<Role, PageKey[]> = {
  admin: ['home', 'catalog', 'stock', 'orders', 'customers', 'settings', 'audit'],
  purchase: ['home', 'catalog', 'stock'],
  store: ['home', 'catalog', 'stock'],
  sales: ['home', 'catalog', 'stock', 'orders', 'customers'],
};

export const ROLE_LABEL: Record<Role, MessageKey> = {
  admin: 'role_admin',
  purchase: 'role_purchase',
  store: 'role_store',
  sales: 'role_sales',
};

export const ROLE_MODULES: Record<Role, RoleModule[]> = {
  admin: [
    { icon: Wallet, title: 'module_finance_title', description: 'module_finance_desc' },
  ],
  purchase: [
    { icon: ShoppingBag, title: 'module_vendors_title', description: 'module_vendors_desc' },
  ],
  store: [
    { icon: Sprout, title: 'module_production_title', description: 'module_production_desc' },
  ],
  sales: [
    { icon: Receipt, title: 'module_pos_title', description: 'module_pos_desc' },
  ],
};

export function navItemsFor(role: Role): NavItem[] {
  return NAV_KEYS_BY_ROLE[role].map((key) => ALL_NAV[key]);
}
