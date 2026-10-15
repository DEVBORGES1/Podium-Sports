import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import logo from '../../assets/logo.webp';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import '../../styles/admin.css';

export default function LoginPage() {
  useDocumentTitle('Entrar no painel');
  const { status, signIn, signOut, sendPasswordReset, error: authError } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [resetSent, setResetSent] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';

  if (status === 'signedIn') return <Navigate to={from.startsWith('/admin') ? from : '/admin'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email.trim(), password);
      else {
        await sendPasswordReset(email.trim());
        setResetSent(true);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="logo-wrap">
          <img src={logo} alt="Podium Sports" />
        </div>
        <h1>{mode === 'login' ? 'Painel administrativo' : 'Recuperar senha'}</h1>
        {status === 'unconfigured' && (
          <p className="alert alert-warn">Autenticação não configurada. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.</p>
        )}
        {status === 'forbidden' && (
          <div className="alert alert-error" role="alert">
            {authError ?? 'Esta conta não tem acesso ao painel.'}{' '}
            <button type="button" className="link-btn" onClick={() => void signOut()}>
              Sair
            </button>
          </div>
        )}
        {status === 'error' && (
          <div className="alert alert-error" role="alert">
            {authError}{' '}
            <button type="button" className="link-btn" onClick={() => void signOut()}>
              Sair
            </button>
          </div>
        )}
        {resetSent ? (
          <p className="alert alert-ok" role="status">
            Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.
          </p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {mode === 'login' && (
              <div className="field">
                <label htmlFor="password">Senha</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            {error && (
              <p className="alert alert-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-gold btn-block" disabled={busy || status === 'unconfigured' || !email || (mode === 'login' && !password)}>
              {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Enviar link'}
            </button>
          </>
        )}
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setMode(mode === 'login' ? 'reset' : 'login');
            setError(null);
            setResetSent(false);
          }}
        >
          {mode === 'login' ? 'Esqueci minha senha' : 'Voltar para o login'}
        </button>
        <Link to="/" className="notice" style={{ textAlign: 'center' }}>
          ← Voltar para a loja
        </Link>
      </form>
    </div>
  );
}
