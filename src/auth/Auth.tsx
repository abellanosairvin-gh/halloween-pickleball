import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { auth } from '../lib/backend';

type AuthState = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in' };

const AuthContext = createContext<AuthState>({ status: 'loading' });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const apply = (signedIn: boolean) => setState({ status: signedIn ? 'signed-in' : 'signed-out' });
    auth.isSignedIn().then(apply, () => apply(false));
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
