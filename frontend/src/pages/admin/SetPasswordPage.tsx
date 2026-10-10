import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import logo from '../../assets/logo.png';
import { LoadingState } from '../../components/ui/States';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import '../../styles/admin.css';

/** Destino dos links de convite e de recuperação de senha enviados pelo Supabase Auth. */
export default function SetPasswordPage() {
  useDocumentTitle('Definir senha');
  const { session, status, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'loading' && !session) return <LoadingState label="Validando link…" />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 10) return setError('Use pelo menos 10 caracteres.');
    if (password !== confirm) return setError('As senhas não conferem.');
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      navigate('/admin', { replace: true });
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
        <h1>Definir senha</h1>
        {!session ? (
          <>
            <p className="alert alert-warn">Link inválido ou expirado. Peça um novo convite ou use “Esqueci minha senha”.</p>
            <Link to="/admin/login" className="btn btn-gold btn-block">
              Ir para o login
            </Link>
          </>
        ) : (
          <>
            <p className="notice">Conta: {session.user.email}</p>
            <div className="field">
              <label htmlFor="new-password">Nova senha</label>
              <input id="new-password" className="input" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="hint">Mínimo de 10 caracteres. Prefira uma frase longa.</span>
            </div>
            <div className="field">
              <label htmlFor="confirm-password">Confirme a senha</label>
              <input id="confirm-password" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && (
              <p className="alert alert-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-gold btn-block" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar senha'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
