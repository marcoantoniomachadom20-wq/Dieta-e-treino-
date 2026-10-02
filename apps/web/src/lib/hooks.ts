import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { api } from './api';
import { useToast } from '../components/ui';

export function useApi<T = any>(url: string | null, opts: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({ queryKey: [url], queryFn: () => api.get<T>(url!), enabled: !!url, ...opts });
}

/**
 * Mutação que, ao terminar, invalida TODO o cache: o app é pequeno e de um usuário só,
 * então simplicidade > granularidade (dashboard, dieta e histórico sempre consistentes).
 */
export function useAction<TVars = any, TRes = any>(fn: (v: TVars) => Promise<TRes>, opts: { success?: string | ((r: TRes) => string | null); onSuccess?: (r: TRes) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<TRes, Error, TVars>({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries();
      const msg = typeof opts.success === 'function' ? opts.success(r) : opts.success;
      if (msg) toast(msg);
      opts.onSuccess?.(r);
    },
    onError: (e) => toast(e.message, true),
  });
}
