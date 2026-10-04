import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Session } from '../data/repo';
import { auth } from '../lib/backend';

type AuthState = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; session: Session };

const AuthContext = createContext<AuthState>({ status: 'loading' });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const apply = (session: Session | null) =>
      setState(session ? { status: 'signed-in', session } : { status: 'signed-out' });
    auth.getSession().then(apply, () => apply(null));
    return auth.onChange(apply);
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function RequireAuth({ children }: { children: ReactNode }) {
  const state = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <div className="boot" aria-busy="true" />;
  if (state.status === 'signed-out') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
