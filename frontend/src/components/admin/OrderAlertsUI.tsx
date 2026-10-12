import { useEffect, useRef, useState } from 'react';
import { useNow } from '../../hooks/useNow';
import { Link } from 'react-router';
import { useOrderAlerts } from '../../contexts/OrderAlertsContext';
import { useToast } from '../../contexts/ToastContext';
import { brl } from '../../lib/format';
import { BellIcon, BellOffIcon, CloseIcon, RefreshIcon } from './AdminIcons';

/** Indicador de conexão do monitor de pedidos (cabeçalho do painel). */
export function LiveIndicator() {
  const { connection, lastSyncAt, lastError, refresh } = useOrderAlerts();
  const now = useNow(5_000);
  const seconds = lastSyncAt ? Math.max(0, Math.round((now - lastSyncAt) / 1000)) : null;
  const label =
    connection === 'offline'
      ? 'Sem conexão — tentando novamente'
      : connection === 'connecting'
        ? 'Conectando…'
        : seconds !== null && seconds < 30
          ? 'Pedidos atualizados'
          : `Atualizado há ${seconds !== null && seconds < 120 ? `${seconds} s` : `${Math.round((seconds ?? 0) / 60)} min`}`;
  return (
    <button
      type="button"
      className={`live ${connection}`}
      onClick={refresh}
      title={connection === 'offline' && lastError ? `${lastError} Clique para tentar agora.` : 'O painel confere novos pedidos a cada 15 segundos. Clique para conferir agora.'}
    >
      <i aria-hidden />
      <span className="live-text">{label}</span>
      {connection === 'offline' && <RefreshIcon className="live-retry" />}
      <span className="sr-only" role="status" aria-live="polite">
        {connection === 'offline' ? 'Sem conexão com o servidor. Os pedidos novos aparecerão quando a conexão voltar.' : ''}
      </span>
    </button>
  );
}

/** Botão do som de novos pedidos, com estado real (ativado, bloqueado pelo navegador, desligado). */
export function SoundControl() {
  const { sound, enableSound, disableSound, testSound, desktop, enableDesktop, disableDesktop } = useOrderAlerts();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (sound === 'unsupported') return null;

  const activate = async () => {
    const ok = await enableSound();
    toast.show(
      ok ? 'Som ativado. Se não ouviu o aviso de teste, confira o volume do computador.' : 'O navegador bloqueou o som. Clique em qualquer lugar da página e tente de novo.',
      { tone: ok ? 'ok' : 'error' },
    );
  };
  const test = async () => {
    const ok = await testSound();
    if (!ok) toast.show('O navegador não liberou o som. Verifique se o site não está silenciado na aba.', { tone: 'error' });
  };
  const toggleDesktop = async () => {
    if (desktop.enabled) return disableDesktop();
    const ok = await enableDesktop();
    if (!ok) toast.show('O navegador não permitiu notificações. Libere em “Permissões do site” (ícone ao lado do endereço).', { tone: 'error' });
  };

  const label = sound === 'ready' ? 'Som ativado' : sound === 'blocked' ? 'Som bloqueado' : 'Ativar som';
  return (
    <div className="sound-ctl" ref={ref}>
      <button
        type="button"
        className={`btn btn-sm sound-btn is-${sound}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => (sound === 'off' ? void activate() : setOpen((v) => !v))}
        title={
          sound === 'blocked'
            ? 'O som está ligado, mas o navegador só libera o áudio depois de um clique na página.'
            : sound === 'off'
              ? 'Tocar um aviso quando chegar um pedido novo'
              : 'Opções do aviso de novos pedidos'
        }
      >
        {sound === 'off' ? <BellOffIcon /> : <BellIcon />}
        <span className="sound-label">{label}</span>
      </button>
      {open && (
        <div className="sound-menu" role="menu" aria-label="Aviso de novos pedidos">
          {sound === 'blocked' && (
            <p className="alert alert-warn">O navegador bloqueou o som até você interagir com a página. Clique em “Liberar e testar”.</p>
          )}
          <button type="button" role="menuitem" className="btn btn-outline btn-sm btn-block" onClick={() => void (sound === 'blocked' ? activate() : test())}>
            {sound === 'blocked' ? 'Liberar e testar som' : 'Testar som'}
          </button>
          {desktop.supported && (
            <button type="button" role="menuitemcheckbox" aria-checked={desktop.enabled} className="btn btn-outline btn-sm btn-block" onClick={() => void toggleDesktop()}>
              {desktop.enabled ? 'Desativar notificação do sistema' : 'Notificar também com a aba em segundo plano'}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="btn btn-quiet btn-sm btn-block"
            onClick={() => {
              disableSound();
              setOpen(false);
              toast.show('Som de novos pedidos desativado.');
            }}
          >
            Silenciar avisos sonoros
          </button>
          <p className="notice">Os avisos funcionam enquanto o painel estiver aberto e conectado. Com o painel fechado, nada é tocado.</p>
        </div>
      )}
    </div>
  );
}

/** Faixa de destaque quando chega pedido novo. Some ao abrir o pedido ou ao fechar. */
export function NewOrderBanner() {
  const { alert, dismissAlert, sound } = useOrderAlerts();
  if (!alert) return null;
  const [first] = alert.orders;
  if (!first) return null;
  const many = alert.orders.length > 1;
  return (
    <div className="new-order-banner" role="alert">
      <BellIcon className="bell-ring" />
      <div className="txt">
        <b>{many ? `${alert.orders.length} pedidos novos` : `Novo pedido ${first.code}`}</b>
        <span>
          {many
            ? alert.afterReconnect
              ? 'Chegaram enquanto o painel estava sem conexão.'
              : 'Aguardando aceite.'
            : `${first.customerName.split(' ')[0]} · ${brl(first.totalCents)} · ${first.fulfillment === 'DELIVERY' ? 'Entrega' : 'Retirada'}`}
          {!alert.soundPlayed && sound !== 'off' && ' · o som não tocou: o navegador ainda não liberou o áudio.'}
        </span>
      </div>
      <Link to={many ? '/admin/orders?view=new' : `/admin/orders?pedido=${first.id}`} className="btn btn-gold btn-sm" onClick={dismissAlert}>
        {many ? 'Ver pedidos novos' : 'Abrir pedido'}
      </Link>
      <button type="button" className="btn btn-quiet btn-sm btn-icon" onClick={dismissAlert} aria-label="Fechar aviso">
        <CloseIcon />
      </button>
    </div>
  );
}
