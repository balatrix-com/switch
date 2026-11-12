import { type FormEvent, useEffect, useState } from 'react';
import { KeyRound, LoaderCircle, ShieldCheck, Zap } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, type AuthUser } from '../context/AuthContext';

function supportLanding(user: AuthUser) {
  const customers = user.supportCustomers ?? [];
  return customers.length === 1
    ? `/support/customers/${customers[0].id}/numbers`
    : '/support';
}

export function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setError(''), [email, password]);
  if (!loading && user) {
    return <Navigate to={user.role === 'CUSTOMER' ? '/dashboard' : user.role === 'SUPPORT_MEMBER' ? supportLanding(user) : '/'} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const authenticated = await login(email.trim(), password);
      const requested = (location.state as { from?: string } | null)?.from;
      navigate(
        requested && authenticated.role === 'SUPER_ADMIN'
          ? requested
          : authenticated.role === 'CUSTOMER'
            ? '/dashboard'
            : authenticated.role === 'SUPPORT_MEMBER'
              ? supportLanding(authenticated)
              : '/',
        { replace: true },
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand"><span><Zap size={22} /></span> Switchboard</div>
        <div className="login-heading">
          <div className="login-icon"><ShieldCheck size={24} /></div>
          <p className="eyebrow">Secure billing console</p>
          <h1 id="login-title">Sign in to your workspace</h1>
          <p>Use your administrator, customer, or Support Member account credentials.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label>Email address<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Password<input type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="button primary" disabled={submitting || loading}>
            {submitting ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
