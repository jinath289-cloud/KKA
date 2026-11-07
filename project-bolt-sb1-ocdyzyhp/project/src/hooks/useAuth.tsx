import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchOwnProfile, signOutUser } from '@/services/authService';
import type { Profile } from '@/types';

export type SignedOutReason = 'inactive' | 'load_failed';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; reason?: SignedOutReason }
  | { status: 'signed-in'; profile: Profile };

interface AuthContextValue {
  state: AuthState;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const resolveSession = async (session: Session | null) => {
      if (!session) {
        setState({ status: 'signed-out' });
        return;
      }
      try {
        const profile = await fetchOwnProfile(session.user.id);
        if (!profile || !profile.is_active) {
          await signOutUser();
          setState({ status: 'signed-out', reason: 'inactive' });
          return;
        }
        setState({ status: 'signed-in', profile });
      } catch (error) {
        console.error('Unable to load the signed-in user profile', error);
        try {
          const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
          if (signOutError) throw signOutError;
        } catch (signOutError) {
          console.error('Unable to clear the local auth session after profile loading failed', signOutError);
        }
        setState({ status: 'signed-out', reason: 'load_failed' });
      }
    };

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        await resolveSession(session);
      })();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ state, signOut: signOutUser }), [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
