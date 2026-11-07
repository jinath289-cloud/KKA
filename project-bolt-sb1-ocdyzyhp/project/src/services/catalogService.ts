import { supabase } from '@/lib/supabase';
import type { ProductRow, RawRow, Role } from '@/types';

const PRICED_PRODUCT_COLUMNS =
  'id, sku, name, category, description, pack_size, pack_unit, stock_kg, low_stock_limit_kg, retail_price, wholesale_price, is_active';
const RAW_COST_COLUMNS = 'id, code, name, stock_kg, low_stock_limit_kg, cost_per_kg, is_active';

export interface ProductInput {
  sku: string;
  name: string;
  category: string;
  description: string | null;
  pack_size: number;
  pack_unit: 'g' | 'kg';
  retail_price: number;
  wholesale_price: number;
  stock_kg: number;
  low_stock_limit_kg: number;
  is_active: boolean;
}

export interface RawMaterialInput {
  code: string;
  name: string;
  cost_per_kg: number;
  stock_kg: number;
  low_stock_limit_kg: number;
  is_active: boolean;
}

/** Store staff get stock only (no prices), so they read through a function that omits price columns. */
export async function fetchProductRows(role: Role, includeInactive = false): Promise<ProductRow[]> {
  if (role === 'store') {
    const { data, error } = await supabase.rpc('list_product_stock');
    if (error) throw error;
    return ((data ?? []) as Omit<ProductRow, 'is_active'>[]).map((row) => ({ ...row, is_active: true }));
  }
  let query = supabase
    .from('products')
    .select(PRICED_PRODUCT_COLUMNS)
    .order('category')
    .order('name');
  if (role !== 'admin' || !includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProductRow[];
}

/** Only admin and purchase staff may see raw material costs; others get stock only. */
export async function fetchRawRows(role: Role, includeInactive = false): Promise<RawRow[]> {
  if (role === 'admin' || role === 'purchase') {
    let query = supabase
      .from('raw_materials')
      .select(RAW_COST_COLUMNS)
      .order('name');
    if (role !== 'admin' || !includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as RawRow[];
  }
  const { data, error } = await supabase.rpc('list_raw_material_stock');
  if (error) throw error;
  return ((data ?? []) as Omit<RawRow, 'is_active'>[]).map((row) => ({ ...row, is_active: true }));
}

export async function fetchActiveRawMaterialNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from('raw_materials')
    .select('name')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((row) => row.name);
}

export async function createProduct(input: ProductInput): Promise<string> {
  const { data, error } = await supabase.from('products').insert({ ...input, stock_kg: 0 }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  const { error } = await supabase.from('products').update({
    sku: input.sku,
    name: input.name,
    category: input.category,
    description: input.description,
    pack_size: input.pack_size,
    pack_unit: input.pack_unit,
    retail_price: input.retail_price,
    wholesale_price: input.wholesale_price,
    low_stock_limit_kg: input.low_stock_limit_kg,
    is_active: input.is_active,
  }).eq('id', id);
  if (error) throw error;
}

export async function createRawMaterial(input: RawMaterialInput): Promise<string> {
  const { data, error } = await supabase
    .from('raw_materials')
    .insert({ ...input, unit: 'kg', stock_kg: 0 })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateRawMaterial(id: string, input: RawMaterialInput): Promise<void> {
  const { error } = await supabase.from('raw_materials').update({
    code: input.code,
    name: input.name,
    cost_per_kg: input.cost_per_kg,
    low_stock_limit_kg: input.low_stock_limit_kg,
    is_active: input.is_active,
  }).eq('id', id);
  if (error) throw error;
}
