export const ROLES = ['admin', 'purchase', 'store', 'sales'] as const;

export type Role = (typeof ROLES)[number];

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  pack_size: number;
  pack_unit: 'g' | 'kg';
  stock_kg: number;
  low_stock_limit_kg: number;
  description?: string | null;
  retail_price?: number;
  wholesale_price?: number;
  is_active?: boolean;
}

export interface RawRow {
  id: string;
  code: string;
  name: string;
  stock_kg: number;
  low_stock_limit_kg: number;
  cost_per_kg?: number;
  is_active?: boolean;
}

export type VendorType = 'farmer' | 'shg' | 'local_producer' | 'trader';

export interface VendorRow {
  id: string;
  name: string;
  vendor_type: VendorType;
  contact_person: string;
  phone: string;
  village_cluster: string;
  address: string | null;
  upi_id: string | null;
  supplies: string[];
  is_id_verified: boolean;
  id_verified_at: string | null;
  is_active: boolean;
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
  actor: { full_name: string } | null;
}
