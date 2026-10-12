/** Cliente HTTP da API: base configurável, JSON, erros tipados e token do administrador. */

export const API_URL = (import.meta.env.VITE_API_URL ?? '/api/v1').replace(/\/$/, '');

export interface FieldIssue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get fieldIssues(): FieldIssue[] {
    return Array.isArray(this.details) ? (this.details as FieldIssue[]).filter((d) => d && typeof d.field === 'string') : [];
  }
}

type TokenProvider = () => Promise<string | null>;
let tokenProvider: TokenProvider = async () => null;
let onUnauthorized: () => void = () => undefined;

export function configureAuth(provider: TokenProvider, unauthorizedHandler: () => void) {
  tokenProvider = provider;
  onUnauthorized = unauthorizedHandler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  auth?: boolean;
  signal?: AbortSignal;
  keepalive?: boolean;
  /** Não encerra a sessão automaticamente em 401 (usado na validação inicial do login). */
  keepSessionOn401?: boolean;
}

export function buildQuery(query?: RequestOptions['query']) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (options.auth) {
    const token = await tokenProvider();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${buildQuery(options.query)}`, {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
      keepalive: options.keepalive,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível conectar. Verifique sua internet e tente novamente.');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    if (res.status === 401 && options.auth && !options.keepSessionOn401) onUnauthorized();
    throw new ApiError(
      res.status,
      e?.code ?? 'HTTP_ERROR',
      e?.message ?? (res.status >= 500 ? 'Erro no servidor. Tente novamente em instantes.' : 'Não foi possível concluir a operação.'),
      e?.details,
      e?.requestId,
    );
  }
  return data as T;
}

export const adminApi = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>(`/admin${path}`, { auth: true, query }),
  post: <T>(path: string, body?: unknown) => request<T>(`/admin${path}`, { method: 'POST', body, auth: true }),
  patch: <T>(path: string, body?: unknown) => request<T>(`/admin${path}`, { method: 'PATCH', body, auth: true }),
  put: <T>(path: string, body?: unknown) => request<T>(`/admin${path}`, { method: 'PUT', body, auth: true }),
  delete: <T = void>(path: string) => request<T>(`/admin${path}`, { method: 'DELETE', auth: true }),
};

/** Mensagem amigável para qualquer erro. */
export function errorMessage(err: unknown) {
  if (err instanceof ApiError) return err.message;
  return 'Algo deu errado. Tente novamente.';
}
