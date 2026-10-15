import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { AppError, conflict } from './errors.js';

/** Operações administrativas no Supabase Auth (convite de novos administradores). */
export interface AuthAdminProvider {
  inviteUser(email: string, redirectTo: string | undefined): Promise<{ authUserId: string }>;
}

class SupabaseAuthAdmin implements AuthAdminProvider {
  private client;
  constructor(url: string, key: string) {
    this.client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  async inviteUser(email: string, redirectTo: string | undefined) {
    const { data, error } = await this.client.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : {});
    if (error || !data.user) {
      if (error?.status === 422 || /already/i.test(error?.message ?? '')) {
        throw conflict('Já existe uma conta de autenticação com este e-mail.');
      }
      throw new AppError(502, 'AUTH_PROVIDER_ERROR', 'Não foi possível enviar o convite agora.');
    }
    return { authUserId: data.user.id };
  }
}

class UnconfiguredAuthAdmin implements AuthAdminProvider {
  async inviteUser(): Promise<never> {
    throw new AppError(503, 'AUTH_NOT_CONFIGURED', 'Supabase Auth não configurado no servidor.');
  }
}

let provider: AuthAdminProvider =
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? new SupabaseAuthAdmin(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY) : new UnconfiguredAuthAdmin();

export const authAdmin = {
  get: () => provider,
  set: (p: AuthAdminProvider) => {
    provider = p;
  },
};
