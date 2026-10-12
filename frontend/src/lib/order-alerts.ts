/**
 * Aviso sonoro e controle de pedidos já notificados no painel.
 *
 * Navegadores só liberam áudio depois de uma interação da pessoa com a página (clique ou tecla).
 * Por isso o som nunca toca sozinho na abertura do painel: o AudioContext é criado/retomado em um
 * clique ("Ativar som" ou o primeiro clique na página, se a preferência já estava ligada), e cada
 * reprodução confere se o contexto está realmente "running" antes de dizer que tocou.
 */

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ?? null;
}

export const soundSupported = () => audioCtor() !== null;

/** Estado real do áudio: "running" significa que o navegador permite tocar agora. */
export const audioState = (): AudioContextState | 'none' => ctx?.state ?? 'none';

/** Deve ser chamado dentro de um evento de clique/tecla. Devolve true se o navegador liberou o áudio. */
export async function unlockAudio(): Promise<boolean> {
  const Ctor = audioCtor();
  if (!Ctor) return false;
  try {
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

/** Duas notas curtas ("plim-plom") — perceptível, mas não estridente. */
function scheduleChime(ac: AudioContext) {
  const start = ac.currentTime + 0.02;
  const notes: [number, number][] = [
    [988, 0], // Si5
    [1319, 0.16], // Mi6
  ];
  for (const [freq, offset] of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = start + offset;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.6);
  }
}

/**
 * Toca o aviso (repetido `times` vezes). Devolve false — sem lançar erro — quando o navegador
 * bloqueou o áudio; quem chama mostra a orientação na tela.
 */
export async function playOrderChime(times = 2): Promise<boolean> {
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    if (ctx.state !== 'running') return false;
    const ac = ctx;
    for (let i = 0; i < times; i++) window.setTimeout(() => scheduleChime(ac), i * 900);
    return true;
  } catch {
    return false;
  }
}

// ---------------- Preferências e deduplicação ----------------

const PREF_KEY = 'podium.admin.sound';
const DESKTOP_PREF_KEY = 'podium.admin.desktopNotifications';
const ALERTED_KEY = 'podium.admin.alertedOrders';
const ALERTED_TTL_MS = 24 * 3_600_000;

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Armazenamento indisponível (modo privado/bloqueado): a preferência vale só nesta aba.
  }
}

export const readSoundPref = () => readStorage(PREF_KEY) === 'on';
export const writeSoundPref = (on: boolean) => writeStorage(PREF_KEY, on ? 'on' : 'off');
export const readDesktopPref = () => readStorage(DESKTOP_PREF_KEY) === 'on';
export const writeDesktopPref = (on: boolean) => writeStorage(DESKTOP_PREF_KEY, on ? 'on' : 'off');

function readAlerted(now: number): Record<string, number> {
  try {
    const parsed = JSON.parse(readStorage(ALERTED_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, t]) => typeof t === 'number' && now - t < ALERTED_TTL_MS)) as Record<
      string,
      number
    >;
  } catch {
    return {};
  }
}

/**
 * Marca os pedidos como notificados e devolve apenas os que ainda não tinham sido notificados
 * em nenhuma aba do painel (evita o mesmo pedido tocar em duas abas abertas).
 */
export function claimAlerts(ids: string[], now = Date.now()): string[] {
  const alerted = readAlerted(now);
  const fresh = ids.filter((id) => !(id in alerted));
  for (const id of fresh) alerted[id] = now;
  if (fresh.length) writeStorage(ALERTED_KEY, JSON.stringify(alerted));
  return fresh;
}

// ---------------- Lógica de novidades (pura, testável) ----------------

export interface LiveOrder {
  id: string;
  code: string;
  customerName: string;
  fulfillment: 'PICKUP' | 'DELIVERY';
  totalCents: number;
  status: string;
  createdAt: string;
}

/**
 * Separa, numa resposta de /orders/live, os pedidos realmente novos para esta sessão.
 * - Na primeira resposta (`known` vazio e `first` = true) nada é novo: só registra o que já existia.
 * - Depois, novo = id nunca visto e ainda aguardando atendimento (um pedido que outra pessoa já
 *   aceitou enquanto o painel estava desconectado não dispara alerta).
 */
export function detectNewOrders(recent: LiveOrder[], known: Set<string>, first: boolean) {
  const unseen = recent.filter((o) => !known.has(o.id));
  for (const o of unseen) known.add(o.id);
  if (first) return [];
  return unseen.filter((o) => o.status === 'PENDING');
}
