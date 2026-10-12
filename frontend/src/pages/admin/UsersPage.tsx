import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ConfirmDialog, FormField, Modal, PageHeader, TableState, Tag } from '../../components/admin/ui';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminMutation } from '../../hooks/useAdminMutation';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi, ApiError, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { Tone } from '../../lib/labels';
import type { AdminUser } from '../../types/admin';
import type { UserRole } from '../../types/api';

const USERS_KEY = ['admin', 'users'] as const;

const ROLE: Record<UserRole, { label: string; tone: Tone; description: string }> = {
  SUPER_ADMIN: { label: 'Superadministrador', tone: 'gold', description: 'Acesso total, incluindo usuários, auditoria e configurações.' },
  ADMIN: { label: 'Administrador', tone: 'info', description: 'Gerencia produtos, estoque, pedidos, banners e promoções.' },
};
const STATUS: Record<AdminUser['status'], { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Ativo', tone: 'ok' },
  DISABLED: { label: 'Desativado', tone: 'neutral' },
};

/** Mensagem clara para os erros esperados desta tela. */
function userErrorMessage(err: unknown) {
  if (err instanceof ApiError) {
    if (err.status === 409) return err.message || 'Já existe um administrador com este e-mail.';
    if (err.status === 422) return err.message;
    if (err.status === 503) return `${err.message} O convite por e-mail depende do Supabase Auth: configure as chaves do Supabase na API e tente novamente.`;
    if (err.status === 403) return 'Somente superadministradores podem gerenciar usuários.';
  }
  return errorMessage(err);
}

type Pending = { user: AdminUser; kind: 'role' | 'status' };

export default function UsersPage() {
  useDocumentTitle('Usuários');
  const { me } = useAuth();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const users = useQuery({ queryKey: [...USERS_KEY], queryFn: () => adminApi.get<{ items: AdminUser[] }>('/users').then((r) => r.items) });

  const update = useAdminMutation((v: { id: string; body: Partial<Pick<AdminUser, 'name' | 'role' | 'status'>> }) => adminApi.patch<AdminUser>(`/users/${v.id}`, v.body), {
    success: 'Usuário atualizado.',
    invalidate: [[...USERS_KEY]],
    silentError: true,
    onSuccess: () => setPending(null),
  });

  const openConfirm = (p: Pending) => {
    update.reset();
    setPending(p);
  };

  const confirmProps = (() => {
    if (!pending) return null;
    const u = pending.user;
    if (pending.kind === 'role') {
      const to: UserRole = u.role === 'SUPER_ADMIN' ? 'ADMIN' : 'SUPER_ADMIN';
      return {
        title: to === 'SUPER_ADMIN' ? 'Promover a superadministrador?' : 'Tornar administrador?',
        message:
          to === 'SUPER_ADMIN' ? (
            <p>
              <b>{u.name}</b> passará a ter acesso total ao painel, incluindo gestão de usuários, auditoria e configurações da loja.
            </p>
          ) : (
            <p>
              <b>{u.name}</b> deixará de acessar usuários e auditoria, mas continua gerenciando produtos, estoque, pedidos, banners e promoções. A loja precisa manter ao menos um superadministrador ativo.
            </p>
          ),
        confirmLabel: to === 'SUPER_ADMIN' ? 'Promover' : 'Alterar função',
        danger: false,
        body: { role: to },
      };
    }
    const disabling = u.status === 'ACTIVE';
    return {
      title: disabling ? 'Desativar acesso?' : 'Reativar acesso?',
      message: disabling ? (
        <p>
          O acesso de <b>{u.name}</b> ao painel é cortado <b>imediatamente</b>: qualquer sessão aberta deixa de funcionar na próxima ação. O histórico (pedidos atendidos, auditoria) é preservado e a conta pode ser reativada depois.
        </p>
      ) : (
        <p>
          <b>{u.name}</b> poderá entrar novamente no painel com o mesmo e-mail e senha, com a função <b>{ROLE[u.role].label}</b>.
        </p>
      ),
      confirmLabel: disabling ? 'Desativar' : 'Reativar',
      danger: disabling,
      body: { status: disabling ? ('DISABLED' as const) : ('ACTIVE' as const) },
    };
  })();

  const list = users.data ?? [];
  const activeSupers = list.filter((u) => u.role === 'SUPER_ADMIN' && u.status === 'ACTIVE').length;

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Pessoas com acesso ao painel administrativo. Somente superadministradores veem esta tela."
        actions={
          <button type="button" className="btn btn-gold btn-sm" onClick={() => setInviting(true)}>
            + Convidar administrador
          </button>
        }
      />
      <p className="notice" style={{ marginBottom: 12 }}>
        Administradores nunca são criados pelo site público: o acesso é sempre por convite. Você não pode alterar a sua própria função nem desativar a sua própria conta (peça a outro superadministrador).
      </p>

      <div className="table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Função</th>
              <th>Situação</th>
              <th>Criado em</th>
              <th className="num">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.isPending || users.isError || list.length === 0 ? (
              <TableState colSpan={6} loading={users.isPending} error={users.error} empty="Nenhum usuário encontrado." onRetry={() => users.refetch()} />
            ) : (
              list.map((u) => {
                const self = u.id === me?.id;
                const lastSuper = u.role === 'SUPER_ADMIN' && u.status === 'ACTIVE' && activeSupers <= 1;
                const selfReason = 'Você não pode alterar a própria função nem desativar a própria conta.';
                const lastSuperReason = 'É necessário manter ao menos um superadministrador ativo.';
                return (
                  <tr key={u.id}>
                    <td>
                      <b>{u.name}</b> {self && <Tag tone="gold">Você</Tag>}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <Tag tone={ROLE[u.role].tone}>{ROLE[u.role].label}</Tag>
                    </td>
                    <td>
                      <Tag tone={STATUS[u.status].tone}>{STATUS[u.status].label}</Tag>
                    </td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td className="num">
                      <div className="row-actions">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(u)} aria-label={`Editar nome de ${u.name}`}>
                          Editar nome
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={self || lastSuper}
                          title={self ? selfReason : lastSuper ? lastSuperReason : undefined}
                          onClick={() => openConfirm({ user: u, kind: 'role' })}
                          aria-label={`${u.role === 'SUPER_ADMIN' ? 'Tornar administrador' : 'Promover a superadministrador'}: ${u.name}`}
                        >
                          {u.role === 'SUPER_ADMIN' ? 'Tornar administrador' : 'Tornar superadmin'}
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${u.status === 'ACTIVE' ? 'btn-danger-outline' : 'btn-outline'}`}
                          disabled={self || lastSuper}
                          title={self ? selfReason : lastSuper ? lastSuperReason : undefined}
                          onClick={() => openConfirm({ user: u, kind: 'status' })}
                          aria-label={`${u.status === 'ACTIVE' ? 'Desativar' : 'Reativar'} ${u.name}`}
                        >
                          {u.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
                        </button>
                      </div>
                      {(self || lastSuper) && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {self ? 'Sua conta: função e situação só podem ser alteradas por outro superadministrador.' : 'Único superadministrador ativo.'}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <section className="adm-card" style={{ marginTop: 16 }}>
        <h2>Funções</h2>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 14 }}>
          {(Object.keys(ROLE) as UserRole[]).map((r) => (
            <li key={r}>
              <b>{ROLE[r].label}:</b> {ROLE[r].description}
            </li>
          ))}
        </ul>
      </section>

      {pending && confirmProps && (
        <ConfirmDialog
          title={confirmProps.title}
          message={confirmProps.message}
          confirmLabel={confirmProps.confirmLabel}
          danger={confirmProps.danger}
          busy={update.isPending}
          onConfirm={() => update.mutate({ id: pending.user.id, body: confirmProps.body })}
          onCancel={() => setPending(null)}
        >
          {update.isError && (
            <p className="alert alert-error" role="alert" style={{ marginTop: 12 }}>
              {userErrorMessage(update.error)}
            </p>
          )}
        </ConfirmDialog>
      )}
      {inviting && <InviteModal onClose={() => setInviting(false)} />}
      {editing && <EditNameModal user={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

const inviteSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome (mínimo 2 caracteres).').max(120, 'Use no máximo 120 caracteres.'),
  email: z.string().trim().max(254, 'Use no máximo 254 caracteres.').pipe(z.email('E-mail inválido.')),
  role: z.enum(['ADMIN', 'SUPER_ADMIN']),
});
type InviteValues = z.infer<typeof inviteSchema>;

function InviteModal({ onClose }: { onClose: () => void }) {
  const { register, handleSubmit, formState, setError } = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: { name: '', email: '', role: 'ADMIN' } });
  const errors = formState.errors;
  const invite = useAdminMutation((v: InviteValues) => adminApi.post<AdminUser>('/users', { ...v, email: v.email.toLowerCase() }), {
    success: (u) => `Convite enviado para ${u.email}.`,
    invalidate: [[...USERS_KEY]],
    silentError: true,
    onSuccess: onClose,
  });

  const onSubmit = handleSubmit((v) =>
    invite.mutate(v, {
      onError: (err) => {
        if (!(err instanceof ApiError)) return;
        if (err.status === 409) setError('email', { type: 'server', message: err.message || 'Já existe um administrador com este e-mail.' });
        for (const issue of err.fieldIssues) if (issue.field === 'name' || issue.field === 'email' || issue.field === 'role') setError(issue.field, { type: 'server', message: issue.message });
      },
    }),
  );

  const showBanner = invite.isError && !(invite.error instanceof ApiError && (invite.error.status === 409 || invite.error.fieldIssues.length > 0));

  return (
    <Modal
      title="Convidar administrador"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose} disabled={invite.isPending}>
            Cancelar
          </button>
          <button type="submit" form="invite-form" className="btn btn-gold btn-sm" disabled={invite.isPending} aria-busy={invite.isPending}>
            {invite.isPending ? 'Enviando…' : 'Enviar convite'}
          </button>
        </>
      }
    >
      <form id="invite-form" onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: 14 }}>
        <p className="notice" style={{ margin: 0 }}>
          A pessoa recebe um e-mail de convite enviado pelo Supabase Auth e define a própria senha na página <b>/admin/definir-senha</b>. Ninguém além dela conhece a senha. Administradores nunca são criados pelo site público.
        </p>
        {showBanner && (
          <p className="alert alert-error" role="alert">
            {userErrorMessage(invite.error)}
          </p>
        )}
        <FormField id="invite-name" label="Nome" error={errors.name?.message}>
          <input id="invite-name" className="input" autoComplete="off" aria-invalid={!!errors.name} {...register('name')} />
        </FormField>
        <FormField id="invite-email" label="E-mail" error={errors.email?.message}>
          <input id="invite-email" type="email" className="input" autoComplete="off" aria-invalid={!!errors.email} {...register('email')} />
        </FormField>
        <FormField id="invite-role" label="Função" error={errors.role?.message} hint={ROLE.ADMIN.description}>
          <select id="invite-role" className="select" {...register('role')}>
            <option value="ADMIN">{ROLE.ADMIN.label}</option>
            <option value="SUPER_ADMIN">{ROLE.SUPER_ADMIN.label} (acesso total)</option>
          </select>
        </FormField>
      </form>
    </Modal>
  );
}

const nameSchema = z.object({ name: z.string().trim().min(2, 'Informe o nome (mínimo 2 caracteres).').max(120, 'Use no máximo 120 caracteres.') });
type NameValues = z.infer<typeof nameSchema>;

function EditNameModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { register, handleSubmit, formState, setError } = useForm<NameValues>({ resolver: zodResolver(nameSchema), defaultValues: { name: user.name } });
  const errors = formState.errors;
  const save = useAdminMutation((v: NameValues) => adminApi.patch<AdminUser>(`/users/${user.id}`, { name: v.name }), {
    success: 'Nome atualizado.',
    invalidate: [[...USERS_KEY]],
    silentError: true,
    onSuccess: onClose,
  });
  const onSubmit = handleSubmit((v) =>
    save.mutate(v, {
      onError: (err) => {
        if (err instanceof ApiError) for (const issue of err.fieldIssues) if (issue.field === 'name') setError('name', { type: 'server', message: issue.message });
      },
    }),
  );

  return (
    <Modal
      title="Editar nome"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline btn-sm" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </button>
          <button type="submit" form="name-form" className="btn btn-gold btn-sm" disabled={save.isPending} aria-busy={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="name-form" onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: 14 }}>
        <p className="notice" style={{ margin: 0 }}>
          E-mail: <b>{user.email}</b> (não pode ser alterado aqui).
        </p>
        {save.isError && !(save.error instanceof ApiError && save.error.fieldIssues.length > 0) && (
          <p className="alert alert-error" role="alert">
            {userErrorMessage(save.error)}
          </p>
        )}
        <FormField id="edit-name" label="Nome" error={errors.name?.message}>
          <input id="edit-name" className="input" aria-invalid={!!errors.name} {...register('name')} />
        </FormField>
      </form>
    </Modal>
  );
}
