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

export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  city_village: string | null;
  address: string | null;
  gstin: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export type OrderStatus = 'draft' | 'confirmed' | 'cancelled';
export type OrderPaymentStatus = 'unpaid' | 'partial' | 'paid';
export type OrderSaleType = 'retail' | 'wholesale';
export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'cheque';

export interface OrderRow {
  id: string;
  order_number: string;
  customer_id: string;
  status: OrderStatus;
  order_date: string;
  subtotal: number;
  discount_amount: number;
  tax_percent: number;
  tax_amount: number;
  total: number;
  paid_amount: number;
  payment_status: OrderPaymentStatus;
  notes: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  confirmed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer?: Pick<CustomerRow, 'id' | 'name' | 'phone' | 'city_village' | 'address' | 'gstin'> | null;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  pack_size: number;
  pack_unit: 'g' | 'kg';
  sale_type: OrderSaleType;
  quantity: number;
  unit_price: number;
  line_total: number;
  kg_equivalent: number;
}

export interface PaymentRow {
  id: string;
  order_id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paid_on: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CustomerBalance {
  customer_id: string;
  total_billed: number;
  total_paid: number;
  outstanding: number;
}

export interface OrderProductOption {
  id: string;
  sku: string;
  name: string;
  pack_size: number;
  pack_unit: 'g' | 'kg';
  retail_price: number;
  wholesale_price: number;
  stock_kg: number;
  is_active: boolean;
}
