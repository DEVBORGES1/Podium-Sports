import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { adminApi } from '../../lib/api';
import type { AdminCategory } from '../../types/admin';

const CUSTOM = '__custom__';

/**
 * Destino de um botão escolhido numa lista (página de produtos, ofertas ou uma categoria),
 * sem a loja precisar digitar endereços. "Outro endereço" continua disponível para casos especiais.
 */
export function LinkPicker({
  id,
  value,
  onChange,
  invalid,
  allowEmpty,
}: {
  id: string;
  value: string;
  onChange: (url: string) => void;
  invalid?: boolean;
  allowEmpty?: boolean;
}) {
  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => adminApi.get<{ items: AdminCategory[] }>('/categories').then((r) => r.items) });
  const options = [
    ...(allowEmpty ? [{ url: '', label: 'Sem botão' }] : []),
    { url: '/produtos', label: 'Todos os produtos' },
    { url: '/produtos?ofertas=1', label: 'Produtos em oferta' },
    ...(categories.data ?? []).filter((c) => c.isActive).map((c) => ({ url: `/produtos?categoria=${c.slug}`, label: `Categoria: ${c.name}` })),
  ];
  const known = options.some((o) => o.url === value);
  const [custom, setCustom] = useState(!known && value !== '');
  const showCustom = custom || (!known && value !== '' && !categories.isPending);
  const selectValue = showCustom ? CUSTOM : value;

  return (
    <div className="link-picker">
      <select
        id={id}
        className="select"
        aria-invalid={invalid}
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(e.target.value);
        }}
      >
        {!allowEmpty && value === '' && !showCustom && <option value="">Escolha o destino…</option>}
        {options.map((o) => (
          <option key={o.url || 'none'} value={o.url}>
            {o.label}
          </option>
        ))}
        <option value={CUSTOM}>Outro endereço (avançado)…</option>
      </select>
      {showCustom && (
        <input
          className="input"
          aria-label="Endereço do botão"
          placeholder="/produto/nome-do-produto ou https://…"
          aria-invalid={invalid}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
        />
      )}
    </div>
  );
}
