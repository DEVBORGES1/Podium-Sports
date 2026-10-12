import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import { errorMessage } from '../lib/api';
import { refreshQueries } from '../lib/query';

/** Mutação do painel com mensagens de sucesso/erro e invalidação de cache. */
export function useAdminMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  options: { success?: string | ((r: TResult) => string); invalidate?: QueryKey[]; onSuccess?: (r: TResult, vars: TVars) => void; silentError?: boolean } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, vars) => {
      if (options.invalidate) refreshQueries(qc, options.invalidate);
      if (options.success) toast.show(typeof options.success === 'function' ? options.success(result) : options.success);
      options.onSuccess?.(result, vars);
    },
    onError: (err) => {
      if (!options.silentError) toast.show(errorMessage(err), { tone: 'error' });
    },
  });
}
