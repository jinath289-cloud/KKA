import { supabase } from '@/lib/supabase';
import type { CustomerBalance, CustomerRow } from '@/types';

export interface CustomerInput {
  name: string;
  phone: string | null;
  city_village: string | null;
  address: string | null;
  gstin: string | null;
  notes: string | null;
}

export async function listCustomers(search = '', includeInactive = true): Promise<CustomerRow[]> {
  let query = supabase
    .from('customers')
    .select('id, name, phone, city_village, address, gstin, notes, is_active, created_at, updated_at, created_by')
    .order('name')
    .order('id');
  if (!includeInactive) query = query.eq('is_active', true);
  if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CustomerRow[];
}

export async function getCustomerBalances(): Promise<CustomerBalance[]> {
  const { data, error } = await supabase.rpc('list_customer_balances');
  if (error) throw error;
  return (data ?? []) as CustomerBalance[];
}

export async function saveCustomer(input: CustomerInput, id?: string): Promise<CustomerRow> {
  const query = id
    ? supabase.from('customers').update(input).eq('id', id)
    : supabase.from('customers').insert(input);
  const { data, error } = await query
    .select('id, name, phone, city_village, address, gstin, notes, is_active, created_at, updated_at, created_by')
    .single();
  if (error) throw error;
  return data as CustomerRow;
}

export async function setCustomerActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('customers').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}
