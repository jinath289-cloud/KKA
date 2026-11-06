import { supabase } from '@/lib/supabase';
import type { ProductRow, RawRow, Role } from '@/types';

const PRICED_PRODUCT_COLUMNS =
  'id, sku, name, category, description, pack_size, pack_unit, stock_kg, low_stock_limit_kg, retail_price, wholesale_price';
const RAW_COST_COLUMNS = 'id, code, name, stock_kg, low_stock_limit_kg, cost_per_kg';

/** Store staff get stock only (no prices), so they read through a function that omits price columns. */
export async function fetchProductRows(role: Role): Promise<ProductRow[]> {
  if (role === 'store') {
    const { data, error } = await supabase.rpc('list_product_stock');
    if (error) throw error;
    return (data ?? []) as ProductRow[];
  }
  const { data, error } = await supabase
    .from('products')
    .select(PRICED_PRODUCT_COLUMNS)
    .eq('is_active', true)
    .order('category')
    .order('name');
  if (error) throw error;
  return (data ?? []) as ProductRow[];
}

/** Only admin and purchase staff may see raw material costs; others get stock only. */
export async function fetchRawRows(role: Role): Promise<RawRow[]> {
  if (role === 'admin' || role === 'purchase') {
    const { data, error } = await supabase
      .from('raw_materials')
      .select(RAW_COST_COLUMNS)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return (data ?? []) as RawRow[];
  }
  const { data, error } = await supabase.rpc('list_raw_material_stock');
  if (error) throw error;
  return (data ?? []) as RawRow[];
}
