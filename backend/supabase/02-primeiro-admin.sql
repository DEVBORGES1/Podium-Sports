-- ============================================================================
-- Podium Sports — primeiro superadministrador
--
-- Antes: Supabase → Authentication → Users → "Add user" → "Create new user",
--        informe e-mail e senha (mín. 10 caracteres) e marque "Auto Confirm User".
-- Depois: troque o e-mail e o nome abaixo e rode este arquivo no SQL Editor.
-- Os próximos administradores são convidados pelo painel (/admin/users).
-- ============================================================================

INSERT INTO public.profiles (id, auth_user_id, name, email, role, status, updated_at)
SELECT gen_random_uuid(), u.id, 'SEU NOME AQUI', lower(u.email), 'SUPER_ADMIN', 'ACTIVE', now()
FROM auth.users u
WHERE lower(u.email) = lower('seu-email@exemplo.com')
ON CONFLICT (auth_user_id) DO UPDATE SET role = 'SUPER_ADMIN', status = 'ACTIVE', updated_at = now()
RETURNING email, role, status;

-- Se o resultado vier vazio, o e-mail não foi encontrado em Authentication → Users.
