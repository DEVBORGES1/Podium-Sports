import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Marca dados como desatualizados depois de uma alteração.
 * Primeiro cancela consultas ainda em andamento: elas começaram antes da alteração e, se
 * reaproveitadas ao voltar para a tela, mostrariam valores antigos (ex.: dashboard sem o
 * pagamento que acabou de ser registrado). Consultas visíveis são refeitas na hora.
 */
export function refreshQueries(qc: QueryClient, keys: QueryKey[]) {
  for (const queryKey of keys) {
    void qc.cancelQueries({ queryKey }).then(() => qc.invalidateQueries({ queryKey }));
  }
}
