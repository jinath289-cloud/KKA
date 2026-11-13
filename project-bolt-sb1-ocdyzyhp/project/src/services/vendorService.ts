import { supabase } from '@/lib/supabase';
import type { Role, VendorRow, VendorType } from '@/types';

const VENDOR_COLUMNS =
  'id, name, vendor_type, contact_person, phone, village_cluster, address, upi_id, supplies, is_id_verified, id_verified_at, is_active';

export interface VendorInput {
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

export async function fetchVendorRows(role: Role, includeInactive = false): Promise<VendorRow[]> {
  let query = supabase.from('vendors').select(VENDOR_COLUMNS).order('name');
  if (role !== 'admin' || !includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as VendorRow[];
}

export async function createVendor(input: VendorInput): Promise<void> {
  const { error } = await supabase.from('vendors').insert(input);
  if (error) throw error;
}

export async function updateVendor(id: string, input: VendorInput): Promise<void> {
  const { error } = await supabase.from('vendors').update(input).eq('id', id);
  if (error) throw error;
}
