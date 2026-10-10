import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useToast } from '../contexts/ToastContext';
import { errorMessage } from '../lib/api';

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
      options.invalidate?.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      if (options.success) toast.show(typeof options.success === 'function' ? options.success(result) : options.success);
      options.onSuccess?.(result, vars);
    },
    onError: (err) => {
      if (!options.silentError) toast.show(errorMessage(err), { tone: 'error' });
    },
  });
}
