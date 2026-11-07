import { supabase } from '@/lib/supabase';
import type {
  Role,
  StockItemOption,
  StockItemType,
  StockMovement,
  StockMovementType,
  VendorRow,
} from '@/types';

export interface StockMovementInput {
  item_type: StockItemType;
  item_id: string;
  movement_type: StockMovementType;
  quantity_kg: number;
  note: string | null;
  vendor_id: string | null;
}

export interface StockMovementFilters {
  fromDate?: string;
  toDate?: string;
  itemType?: StockItemType;
  itemId?: string;
  movementType?: StockMovementType;
  from: number;
  to: number;
}

const MOVEMENT_COLUMNS =
  'id, item_type, item_id, movement_type, quantity_kg, note, vendor_id, balance_after_kg, created_by, created_at, vendor:vendors(name)';

export async function fetchStockItems(role: Role): Promise<StockItemOption[]> {
  const [products, rawMaterials] = await Promise.all([
    role === 'store'
      ? supabase.rpc('list_product_stock')
      : supabase.from('products').select('id, sku, name, stock_kg, low_stock_limit_kg, is_active').order('name'),
    role === 'store' || role === 'sales'
      ? supabase.rpc('list_raw_material_stock')
      : supabase.from('raw_materials').select('id, code, name, stock_kg, low_stock_limit_kg, is_active').order('name'),
  ]);
  if (products.error) throw products.error;
  if (rawMaterials.error) throw rawMaterials.error;

  const productRows = (products.data ?? []) as Array<{
    id: string;
    sku: string;
    name: string;
    stock_kg: number;
    low_stock_limit_kg: number;
    is_active?: boolean;
  }>;
  const rawRows = (rawMaterials.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    stock_kg: number;
    low_stock_limit_kg: number;
    is_active?: boolean;
  }>;

  return [
    ...productRows.map((row) => ({
      id: row.id,
      item_type: 'product' as const,
      code: row.sku,
      name: row.name,
      stock_kg: row.stock_kg,
      low_stock_limit_kg: row.low_stock_limit_kg,
      is_active: row.is_active !== false,
    })),
    ...rawRows.map((row) => ({
      id: row.id,
      item_type: 'raw_material' as const,
      code: row.code,
      name: row.name,
      stock_kg: row.stock_kg,
      low_stock_limit_kg: row.low_stock_limit_kg,
      is_active: row.is_active !== false,
    })),
  ];
}

export async function fetchStockVendors(): Promise<Pick<VendorRow, 'id' | 'name'>[]> {
  const { data, error } = await supabase.rpc('list_stock_vendors');
  if (error) throw error;
  return (data ?? []) as Pick<VendorRow, 'id' | 'name'>[];
}

export async function recordStockMovement(input: StockMovementInput): Promise<StockMovement> {
  const { data, error } = await supabase.rpc('record_stock_movement', {
    p_item_type: input.item_type,
    p_item_id: input.item_id,
    p_movement_type: input.movement_type,
    p_quantity_kg: input.quantity_kg,
    p_note: input.note,
    p_vendor_id: input.vendor_id,
  });
  if (error) throw error;
  if (!data) throw new Error('Stock movement was not returned by the server');
  return data as StockMovement;
}

export async function fetchStockMovements(filters: StockMovementFilters): Promise<StockMovement[]> {
  let query = supabase
    .from('stock_movements')
    .select(MOVEMENT_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (filters.fromDate) {
    query = query.gte('created_at', new Date(`${filters.fromDate}T00:00:00`).toISOString());
  }
  if (filters.toDate) {
    const end = new Date(`${filters.toDate}T00:00:00`);
    end.setDate(end.getDate() + 1);
    query = query.lt('created_at', end.toISOString());
  }
  if (filters.itemType) query = query.eq('item_type', filters.itemType);
  if (filters.itemId) query = query.eq('item_id', filters.itemId);
  if (filters.movementType) query = query.eq('movement_type', filters.movementType);
  const { data, error } = await query.range(filters.from, filters.to);
  if (error) throw error;
  return (data ?? []) as StockMovement[];
}

export async function fetchAllFilteredStockMovements(
  filters: Omit<StockMovementFilters, 'from' | 'to'>,
): Promise<StockMovement[]> {
  const pageSize = 500;
  const rows: StockMovement[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchStockMovements({ ...filters, from, to: from + pageSize - 1 });
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
