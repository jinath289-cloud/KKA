import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOutUser(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function fetchOwnProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, is_active, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function fetchDemoLoginVisible(): Promise<boolean> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'show_demo_login')
    .maybeSingle();
  if (error) throw error;
  return data?.value === true;
}
