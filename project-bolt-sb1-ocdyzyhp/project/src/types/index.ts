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

export type StockItemType = 'product' | 'raw_material';
export type StockMovementType =
  | 'opening'
  | 'purchase_in'
  | 'production_in'
  | 'production_out'
  | 'sale_out'
  | 'return_in'
  | 'wastage'
  | 'adjustment_in'
  | 'adjustment_out';

export interface StockItemOption {
  id: string;
  item_type: StockItemType;
  code: string;
  name: string;
  stock_kg: number;
  low_stock_limit_kg: number;
  is_active: boolean;
}

export interface StockMovement {
  id: string;
  item_type: StockItemType;
  item_id: string;
  movement_type: StockMovementType;
  quantity_kg: number;
  note: string | null;
  vendor_id: string | null;
  balance_after_kg: number;
  created_by: string | null;
  created_at: string;
  vendor?: { name: string } | { name: string }[] | null;
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
