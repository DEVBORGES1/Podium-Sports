import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { setTitleBadge } from '../hooks/useDocumentTitle';
import { adminApi, errorMessage } from '../lib/api';
import { brl } from '../lib/format';
import { refreshQueries } from '../lib/query';
import {
  audioState,
  claimAlerts,
  detectNewOrders,
  playOrderChime,
  readDesktopPref,
  readSoundPref,
  soundSupported,
  unlockAudio,
  writeDesktopPref,
  writeSoundPref,
  type LiveOrder,
} from '../lib/order-alerts';
import type { OrderStatus } from '../types/api';

/** Intervalo normal entre consultas e limite do intervalo após falhas seguidas. */
export const POLL_MS = 15_000;
const MAX_BACKOFF_MS = 60_000;

interface LiveResponse {
  serverTime: string;
  counts: Record<OrderStatus, number>;
  lastChangeAt: string | null;
  recentOrders: LiveOrder[];
}

/** off: desligado · ready: liberado pelo navegador · blocked: ligado, mas aguardando um clique · unsupported */
export type SoundStatus = 'off' | 'ready' | 'blocked' | 'unsupported';
export type Connection = 'connecting' | 'online' | 'offline';

export interface OrderAlert {
  orders: LiveOrder[];
  at: number;
  /** Chegaram enquanto o painel estava sem conexão. */
  afterReconnect: boolean;
  /** O som foi realmente reproduzido (false se desligado ou bloqueado pelo navegador). */
  soundPlayed: boolean;
}

interface OrderAlertsApi {
  connection: Connection;
  /** Motivo da última falha de comunicação (exibido quando offline). */
  lastError: string | null;
  lastSyncAt: number | null;
  counts: Record<OrderStatus, number> | null;
  /** Pedidos que chegaram nesta sessão e ainda não foram abertos (destaque visual). */
  newOrderIds: ReadonlySet<string>;
  alert: OrderAlert | null;
  dismissAlert: () => void;
  markSeen: (orderId: string) => void;
  sound: SoundStatus;
  /** Liga o som dentro do clique: libera o áudio e toca o aviso de teste. */
  enableSound: () => Promise<boolean>;
  disableSound: () => void;
  testSound: () => Promise<boolean>;
  desktop: { supported: boolean; enabled: boolean; permission: NotificationPermission | 'unsupported' };
  enableDesktop: () => Promise<boolean>;
  disableDesktop: () => void;
  refresh: () => void;
}

const OrderAlertsContext = createContext<OrderAlertsApi | null>(null);

const notificationSupported = () => typeof window !== 'undefined' && 'Notification' in window;

/**
 * Monitor de pedidos do painel: consulta /admin/orders/live a cada 15 s (Realtime do Supabase não é usado
 * porque exigiria liberar a leitura de pedidos para a chave pública — ver docs/SEGURANCA.md).
 * Uma única consulta por aba; o som toca no máximo uma vez por lote de pedidos novos.
 */
export function OrderAlertsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [connection, setConnection] = useState<Connection>('connecting');
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<OrderStatus, number> | null>(null);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(() => new Set());
  const [alert, setAlert] = useState<OrderAlert | null>(null);
  const [soundPref, setSoundPref] = useState(readSoundPref);
  const [audioReady, setAudioReady] = useState(() => audioState() === 'running');
  const [desktopPref, setDesktopPref] = useState(readDesktopPref);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => (notificationSupported() ? Notification.permission : 'unsupported'));

  // Estado da consulta guardado em refs: não reinicia o ciclo a cada renderização.
  const cursor = useRef<string | null>(null);
  const known = useRef(new Set<string>());
  const lastChange = useRef<string | null>(null);
  const prefs = useRef({ sound: soundPref, desktop: desktopPref });
  useEffect(() => {
    prefs.current = { sound: soundPref, desktop: desktopPref };
  }, [soundPref, desktopPref]);

  const notifyDesktop = useCallback((orders: LiveOrder[]) => {
    if (!prefs.current.desktop || !notificationSupported() || Notification.permission !== 'granted' || !document.hidden) return;
    const first = orders[0]!;
    // Sem nome ou telefone do cliente: a notificação pode aparecer na tela bloqueada.
    const n = new Notification(orders.length > 1 ? `${orders.length} pedidos novos` : `Novo pedido ${first.code}`, {
      body: orders.length > 1 ? 'Abra o painel para atender.' : `${brl(first.totalCents)} · ${first.fulfillment === 'DELIVERY' ? 'Entrega' : 'Retirada'}`,
      tag: `pedido-${first.id}`,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  }, []);

  const handleFresh = useCallback(
    async (fresh: LiveOrder[], afterReconnect: boolean) => {
      // Outra aba do painel já avisou estes pedidos? Então só destaca, sem tocar de novo.
      const toAlert = new Set(claimAlerts(fresh.map((o) => o.id)));
      setNewOrderIds((prev) => new Set([...prev, ...fresh.map((o) => o.id)]));
      let soundPlayed = false;
      if (toAlert.size > 0) {
        if (prefs.current.sound) {
          soundPlayed = await playOrderChime();
          setAudioReady(audioState() === 'running');
        }
        notifyDesktop(fresh.filter((o) => toAlert.has(o.id)));
      }
      setAlert({ orders: fresh, at: Date.now(), afterReconnect, soundPlayed });
    },
    [notifyDesktop],
  );

  // Ciclo de consulta: uma única cadeia de setTimeout por aba, encerrada ao sair do painel.
  const refreshRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    let timer: number | undefined;
    let failures = 0;
    let wasOffline = false;

    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      window.clearTimeout(timer);
      try {
        const data = await adminApi.get<LiveResponse>('/orders/live', cursor.current ? { since: cursor.current } : undefined);
        if (!active) return;
        const first = cursor.current === null;
        const fresh = detectNewOrders(data.recentOrders, known.current, first);
        cursor.current = data.serverTime;
        setCounts(data.counts);
        setLastSyncAt(Date.now());
        setConnection('online');
        setLastError(null);
        const reconnected = wasOffline;
        wasOffline = false;
        failures = 0;
        if (lastChange.current !== null && data.lastChangeAt !== lastChange.current) {
          // Algo mudou (pedido novo ou alterado por outra pessoa): atualiza listas e detalhes abertos.
          refreshQueries(qc, [['admin', 'orders'], ['admin', 'order'], ['admin', 'dashboard']]);
        }
        lastChange.current = data.lastChangeAt ?? '';
        if (fresh.length > 0) await handleFresh(fresh, reconnected);
      } catch (err) {
        failures += 1;
        wasOffline = true;
        if (active) {
          setConnection('offline');
          setLastError(errorMessage(err));
        }
      } finally {
        inFlight = false;
        // Após falhas seguidas o intervalo dobra (até 1 min) para não sobrecarregar a API.
        if (active) timer = window.setTimeout(() => void poll(), Math.min(POLL_MS * 2 ** Math.max(0, failures - 1), MAX_BACKOFF_MS));
      }
    };

    refreshRef.current = () => void poll();
    void poll();
    // Voltar para a aba ou recuperar a internet consulta na hora (o navegador atrasa timers em segundo plano).
    const onVisible = () => document.visibilityState === 'visible' && void poll();
    const onOnline = () => void poll();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      active = false;
      window.clearTimeout(timer);
      refreshRef.current = () => undefined;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [qc, handleFresh]);

  // Preferência ligada após recarregar a página: o navegador exige um clique para liberar o áudio.
  useEffect(() => {
    if (!soundPref || audioReady) return;
    const unlock = () => {
      void unlockAudio().then(setAudioReady);
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, [soundPref, audioReady]);

  const pending = counts?.PENDING ?? 0;
  useEffect(() => {
    setTitleBadge(pending > 0 ? `(${pending}) ` : '');
    return () => setTitleBadge('');
  }, [pending]);

  const enableSound = useCallback(async () => {
    const ok = (await unlockAudio()) && (await playOrderChime(1));
    setAudioReady(audioState() === 'running');
    setSoundPref(true);
    writeSoundPref(true);
    return ok;
  }, []);
  const disableSound = useCallback(() => {
    setSoundPref(false);
    writeSoundPref(false);
  }, []);
  const testSound = useCallback(async () => {
    const ok = (await unlockAudio()) && (await playOrderChime(1));
    setAudioReady(audioState() === 'running');
    return ok;
  }, []);

  const enableDesktop = useCallback(async () => {
    if (!notificationSupported()) return false;
    const result = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    setPermission(result);
    const ok = result === 'granted';
    setDesktopPref(ok);
    writeDesktopPref(ok);
    return ok;
  }, []);
  const disableDesktop = useCallback(() => {
    setDesktopPref(false);
    writeDesktopPref(false);
  }, []);

  const markSeen = useCallback((orderId: string) => {
    setNewOrderIds((prev) => {
      if (!prev.has(orderId)) return prev;
      const next = new Set(prev);
      next.delete(orderId);
      return next;
    });
  }, []);
  const dismissAlert = useCallback(() => setAlert(null), []);
  const refresh = useCallback(() => refreshRef.current(), []);

  const sound: SoundStatus = !soundSupported() ? 'unsupported' : !soundPref ? 'off' : audioReady ? 'ready' : 'blocked';

  const value = useMemo<OrderAlertsApi>(
    () => ({
      connection,
      lastError,
      lastSyncAt,
      counts,
      newOrderIds,
      alert,
      dismissAlert,
      markSeen,
      sound,
      enableSound,
      disableSound,
      testSound,
      desktop: { supported: notificationSupported(), enabled: desktopPref && permission === 'granted', permission },
      enableDesktop,
      disableDesktop,
      refresh,
    }),
    [connection, lastError, lastSyncAt, counts, newOrderIds, alert, dismissAlert, markSeen, sound, enableSound, disableSound, testSound, desktopPref, permission, enableDesktop, disableDesktop, refresh],
  );
  return <OrderAlertsContext.Provider value={value}>{children}</OrderAlertsContext.Provider>;
}

export function useOrderAlerts() {
  const ctx = useContext(OrderAlertsContext);
  if (!ctx) throw new Error('useOrderAlerts fora do OrderAlertsProvider');
  return ctx;
}
