import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AuditEntry, Profile, Role } from '@/types';

export interface NewStaffInput {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role: Role;
}

const PROFILE_COLUMNS = 'id, full_name, phone, role, is_active, created_at';

export async function listStaffProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function createStaffAccount(input: NewStaffInput): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ id?: string; error?: string }>(
    'admin-create-user',
    { body: input },
  );
  if (error) {
    let message = error.message;
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
      if (body?.error) message = body.error;
    }
    throw new Error(message);
  }
  if (!data?.id) throw new Error('Unexpected response from the server');
}

export async function setStaffRole(userId: string, role: Role): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_role', { p_user: userId, p_role: role });
  if (error) throw error;
}

export async function setStaffActive(userId: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_active', { p_user: userId, p_active: active });
  if (error) throw error;
}

export async function listAuditEntries(from: number, to: number): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select(
      'id, action, entity, entity_id, old_values, new_values, reason, created_at, actor:profiles!created_by(full_name)',
    )
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const actor = (row as { actor: { full_name: string } | { full_name: string }[] | null }).actor;
    const normalizedActor = Array.isArray(actor) ? (actor[0] ?? null) : actor;
    return { ...row, actor: normalizedActor } as AuditEntry;
  });
}
