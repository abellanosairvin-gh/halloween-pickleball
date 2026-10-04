import { type FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { DEMO_PASSWORD } from '../data/localRepo';
import { auth, isDemo } from '../lib/backend';
import { useAuth } from './Auth';

export function LoginPage() {
  const state = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === 'signed-in') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/players'} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.signIn(email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login__card" onSubmit={submit} noValidate>
        <h1 className="login__title">Irvin’s Halloween Pickleball Party</h1>
        <p className="login__lede">Organizer sign in</p>

        <label className="field">
          <span className="field__label">Email</span>
          <input
            className="input"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn--primary btn--block" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {isDemo && (
          <p className="login__note">
            Demo mode: use any email with the password “{DEMO_PASSWORD}”. Data stays in this browser until Supabase is
            connected.
          </p>
        )}
      </form>
    </main>
  );
}
