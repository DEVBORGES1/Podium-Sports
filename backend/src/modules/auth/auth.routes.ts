import { Router } from 'express';
import { currentProfile, requireAdmin } from '../../middlewares/auth.js';

/**
 * Login, logout e renovação de sessão são feitos pelo Supabase Auth no frontend.
 * A API apenas valida o token e informa o perfil/permissões do usuário.
 */
export const authRouter = Router();
authRouter.get('/auth/me', requireAdmin, (req, res) => {
  const p = currentProfile(req);
  res.json({ id: p.id, name: p.name, email: p.email, role: p.role, status: p.status });
});
