import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, configureAuth, request } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { Me } from '../types/api';

type Status = 'loading' | 'unconfigured' | 'signedOut' | 'signedIn' | 'forbidden' | 'error';

interface AuthApi {
  status: Status;
  me: Me | null;
  session: Session | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

/** Sessão do Supabase Auth + perfil/permissões validados pela API a cada login. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<Status>(supabase ? 'loading' : 'unconfigured');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    configureAuth(
      async () => (await supabase!.auth.getSession()).data.session?.access_token ?? null,
      () => {
        void supabase!.auth.signOut();
      },
    );
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setStatus('signedOut');
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setMe(null);
        setStatus('signedOut');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const accessToken = session?.access_token;
  const userId = session?.user.id;
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    request<Me>('/auth/me', { auth: true, keepSessionOn401: true })
      .then((profile) => {
        if (cancelled) return;
        setMe(profile);
        setStatus('signedIn');
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setMe(null);
        if (err instanceof ApiError && err.status === 403) {
          setStatus('forbidden');
          setError(err.message);
        } else if (err instanceof ApiError && err.status === 401) {
          // Login aceito pelo Supabase, mas o token foi recusado pela API: quase sempre configuração do servidor.
          setStatus('error');
          setError('O login foi aceito, mas o servidor recusou a sessão. Verifique no Render as variáveis SUPABASE_URL e SUPABASE_JWT_SECRET.');
        } else if (err instanceof ApiError && err.status === 0) {
          setStatus('error');
          setError('Não foi possível falar com o servidor da loja. Ele pode estar iniciando — aguarde alguns segundos e recarregue a página.');
        } else {
          setStatus('error');
          setError(err instanceof ApiError ? err.message : 'Falha ao validar o acesso.');
        }
      });
    return () => {
      cancelled = true;
    };
    // Revalida apenas quando muda o usuário (renovações de token não recarregam o perfil).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Autenticação não configurada.');
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (e) {
      if (/invalid login credentials/i.test(e.message)) throw new Error('E-mail ou senha incorretos.');
      if (/email not confirmed/i.test(e.message)) {
        throw new Error('E-mail ainda não confirmado. No Supabase, abra Authentication → Users e confirme o usuário.');
      }
      throw new Error(`Não foi possível entrar (${e.message}).`);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setMe(null);
    setStatus('signedOut');
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Autenticação não configurada.');
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/admin/definir-senha` });
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) throw new Error('Autenticação não configurada.');
    const { error: e } = await supabase.auth.updateUser({ password });
    if (e)
      throw new Error(
        /should be different/i.test(e.message) ? 'A nova senha deve ser diferente da anterior.' : 'Não foi possível salvar a senha. O link pode ter expirado.',
      );
  }, []);

  const value = useMemo(
    () => ({ status, me, session, error, signIn, signOut, sendPasswordReset, updatePassword }),
    [status, me, session, error, signIn, signOut, sendPasswordReset, updatePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
