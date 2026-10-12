import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimAlerts, detectNewOrders, readSoundPref, writeSoundPref, type LiveOrder } from './order-alerts';

const order = (id: string, status = 'PENDING'): LiveOrder => ({
  id,
  code: `PS-${id.toUpperCase().padEnd(6, 'X').slice(0, 6)}`,
  customerName: 'Maria',
  fulfillment: 'PICKUP',
  totalCents: 1000,
  status,
  createdAt: new Date().toISOString(),
});

/** AudioContext mínimo: "suspended" até resume(); `blocked` simula o navegador recusando o áudio. */
function fakeAudio(blocked = false) {
  const created: string[] = [];
  class FakeAudioContext {
    state: AudioContextState = 'suspended';
    currentTime = 0;
    destination = {};
    async resume() {
      if (!blocked) this.state = 'running';
    }
    createOscillator() {
      created.push('osc');
      return { type: 'sine', frequency: { value: 0 }, connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() };
    }
    createGain() {
      return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (n: unknown) => n };
    }
  }
  Object.defineProperty(window, 'AudioContext', { value: FakeAudioContext, configurable: true, writable: true });
  return created;
}

describe('detecção de pedidos novos', () => {
  it('primeira consulta só registra o que já existe (abrir o painel não toca alerta)', () => {
    const known = new Set<string>();
    expect(detectNewOrders([order('a'), order('b')], known, true)).toEqual([]);
    expect([...known]).toEqual(['a', 'b']);
  });

  it('avisa somente pedidos nunca vistos e ainda aguardando aceite', () => {
    const known = new Set(['a']);
    const fresh = detectNewOrders([order('a'), order('c'), order('d', 'ACCEPTED')], known, false);
    expect(fresh.map((o) => o.id)).toEqual(['c']);
    // A janela de sobreposição repete pedidos já vistos: nenhum alerta novo.
    expect(detectNewOrders([order('a'), order('c'), order('d', 'ACCEPTED')], known, false)).toEqual([]);
  });

  it('após reconexão, avisa só os que chegaram durante a queda — não o histórico', () => {
    const known = new Set(['a', 'b']);
    const afterOutage = detectNewOrders([order('a'), order('b'), order('e'), order('f')], known, false);
    expect(afterOutage.map((o) => o.id)).toEqual(['e', 'f']);
  });
});

describe('deduplicação entre abas', () => {
  beforeEach(() => localStorage.clear());

  it('um pedido avisado em uma aba não toca de novo em outra', () => {
    expect(claimAlerts(['x', 'y'])).toEqual(['x', 'y']);
    expect(claimAlerts(['y', 'z'])).toEqual(['z']);
  });

  it('registros com mais de 24 h são descartados', () => {
    const now = Date.now();
    claimAlerts(['old'], now - 25 * 3_600_000);
    expect(claimAlerts(['old'], now)).toEqual(['old']);
  });

  it('dados corrompidos no armazenamento não quebram o painel', () => {
    localStorage.setItem('podium.admin.alertedOrders', '{nao-e-json');
    expect(claimAlerts(['k'])).toEqual(['k']);
  });

  it('guarda a preferência de som', () => {
    expect(readSoundPref()).toBe(false);
    writeSoundPref(true);
    expect(readSoundPref()).toBe(true);
  });
});

describe('aviso sonoro', () => {
  beforeEach(() => vi.resetModules());

  it('não toca antes de o áudio ser liberado por um clique', async () => {
    fakeAudio();
    const audio = await import('./order-alerts');
    expect(await audio.playOrderChime()).toBe(false);
  });

  it('toca depois de liberado (duas notas por repetição)', async () => {
    vi.useFakeTimers();
    const created = fakeAudio();
    const audio = await import('./order-alerts');
    expect(await audio.unlockAudio()).toBe(true);
    expect(await audio.playOrderChime(2)).toBe(true);
    vi.runAllTimers();
    expect(created).toHaveLength(4);
    vi.useRealTimers();
  });

  it('informa falha quando o navegador mantém o áudio bloqueado', async () => {
    fakeAudio(true);
    const audio = await import('./order-alerts');
    expect(await audio.unlockAudio()).toBe(false);
    expect(await audio.playOrderChime()).toBe(false);
    expect(audio.audioState()).toBe('suspended');
  });
});
