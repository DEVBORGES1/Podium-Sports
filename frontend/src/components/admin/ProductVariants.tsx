import { useState } from 'react';
import { useAdminMutation } from '../../hooks/useAdminMutation';
import { adminApi } from '../../lib/api';
import type { AdminProduct } from '../../types/admin';
import { CloseIcon } from './AdminIcons';
import { ConfirmDialog, FormField } from './ui';

const VARIANT_TYPES = ['Tamanho', 'Numeração', 'Sabor', 'Cor'];
/** Atalhos para preencher as opções mais comuns de uma vez. */
const PRESETS: { label: string; type: string; options: string[] }[] = [
  { label: 'Numeração 34 a 44', type: 'Numeração', options: ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44'] },
  { label: 'Numeração infantil 28 a 35', type: 'Numeração', options: ['28', '29', '30', '31', '32', '33', '34', '35'] },
  { label: 'P, M, G, GG', type: 'Tamanho', options: ['P', 'M', 'G', 'GG'] },
];

interface VariantRow {
  key: string;
  id?: string;
  label: string;
  /** Saldo desejado (o que aparece no campo). */
  stock: number;
  /** Saldo carregado do servidor: só a diferença é enviada, preservando reservas feitas nesse meio-tempo. */
  baseStock: number;
  isActive: boolean;
}

interface VariantsBody {
  variantType: string | null;
  variants: { id?: string; label: string; isActive: boolean; stockDelta: number }[];
}

const rowsFrom = (p: AdminProduct): VariantRow[] =>
  (p.variants ?? []).map((v) => ({ key: v.id, id: v.id, label: v.label, stock: v.stockQuantity, baseStock: v.stockQuantity, isActive: v.isActive }));

/** Linha comparável (sem chave/saldo carregado) para saber se há alterações não salvas. */
const comparable = (rows: VariantRow[]) => JSON.stringify(rows.map((r) => [r.id ?? null, r.label, r.stock, r.isActive]));

const toStock = (v: string) => (v === '' ? 0 : Math.max(0, Math.floor(Number(v)) || 0));

let tmpKey = 0;
const newRow = (label = ''): VariantRow => ({ key: `new-${++tmpKey}`, label, stock: 0, baseStock: 0, isActive: true });

/** Opções do produto (tamanho, sabor…) com estoque próprio. Salvas à parte do formulário principal. */
export function ProductVariants({ product }: { product: AdminProduct }) {
  const has = (product.variants?.length ?? 0) > 0;
  const [type, setType] = useState(product.variantType ?? 'Tamanho');
  const [rows, setRows] = useState<VariantRow[]>(() => rowsFrom(product));
  const [editing, setEditing] = useState(has);
  const [confirmOff, setConfirmOff] = useState(false);

  // Produto recarregado (após salvar ou por outra tela): a tabela volta ao que está no servidor.
  const loaded = JSON.stringify(product.variants ?? []) + (product.variantType ?? '');
  const [prevLoaded, setPrevLoaded] = useState(loaded);
  if (loaded !== prevLoaded) {
    setPrevLoaded(loaded);
    setRows(rowsFrom(product));
    setType(product.variantType ?? 'Tamanho');
    setEditing(has);
  }

  const save = useAdminMutation((body: VariantsBody) => adminApi.put<AdminProduct>(`/products/${product.id}/variants`, body), {
    success: (r) => (r.variants?.length ? `Opções salvas. Estoque total: ${r.stockQuantity}.` : 'O produto voltou a ter estoque único.'),
    invalidate: [['admin', 'product', product.id], ['admin', 'products'], ['admin', 'inventory'], ['products'], ['product']],
    onSuccess: () => setConfirmOff(false),
  });

  const labels = rows.map((r) => r.label.trim().toLocaleLowerCase('pt-BR'));
  const duplicated = new Set(labels.filter((l, i) => l && labels.indexOf(l) !== i));
  const invalid = rows.length === 0 || rows.some((r) => !r.label.trim()) || duplicated.size > 0 || type.trim().length < 2;
  const dirty = comparable(rows) !== comparable(rowsFrom(product)) || type !== (product.variantType ?? 'Tamanho');
  const total = rows.reduce((s, r) => s + (r.isActive ? r.stock : 0), 0);

  const set = (key: string, patch: Partial<VariantRow>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, dir: -1 | 1) =>
    setRows((list) => {
      const target = index + dir;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setType(preset.type);
    setRows((list) => [...list.filter((r) => r.label.trim() || r.id), ...preset.options.filter((o) => !list.some((r) => r.label.trim() === o)).map((o) => newRow(o))]);
    setEditing(true);
  };
  const submit = () =>
    save.mutate({
      variantType: type.trim(),
      variants: rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), label: r.label.trim(), isActive: r.isActive, stockDelta: r.stock - r.baseStock })),
    });

  const presets = (
    <div className="variant-presets">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() => {
          setRows((list) => [...list, newRow()]);
          setEditing(true);
        }}
      >
        + {editing ? 'Adicionar opção' : 'Cadastrar opções'}
      </button>
      {PRESETS.map((p) => (
        <button key={p.label} type="button" className="btn btn-quiet btn-sm" onClick={() => applyPreset(p)}>
          {p.label}
        </button>
      ))}
    </div>
  );

  return (
    <section className="adm-card">
      <h2>
        Tamanhos, sabores e cores <small>Cada opção tem seu estoque. O cliente escolhe na página do produto.</small>
      </h2>
      {!editing ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <p className="notice">
            Este produto tem estoque único. Se ele vem em tamanhos, numerações ou sabores, cadastre as opções: o cliente escolhe na loja e o estoque passa a ser controlado por
            opção.
          </p>
          {presets}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <FormField id="variantType" label="Nome da escolha" hint="Aparece para o cliente. Ex.: Tamanho, Numeração, Sabor, Cor.">
            <input id="variantType" className="input" list="variant-types" value={type} maxLength={30} onChange={(e) => setType(e.target.value)} />
          </FormField>
          <datalist id="variant-types">
            {VARIANT_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {!has && product.stockQuantity > 0 && (
            <p className="notice">Ao salvar, o estoque único atual ({product.stockQuantity}) é zerado: lance a quantidade de cada opção abaixo.</p>
          )}
          <div className="variant-table" role="table" aria-label="Opções do produto">
            <div className="vt-row vt-head" role="row">
              <span role="columnheader">Opção</span>
              <span role="columnheader">Estoque</span>
              <span role="columnheader">Na loja</span>
              <span role="columnheader">
                <span className="sr-only">Ações</span>
              </span>
            </div>
            {rows.map((r, i) => (
              <div key={r.key} className={`vt-row${r.isActive ? '' : ' off'}`} role="row">
                <span role="cell">
                  <label className="sr-only" htmlFor={`vl-${r.key}`}>
                    Opção {i + 1}
                  </label>
                  <input
                    id={`vl-${r.key}`}
                    className="input"
                    value={r.label}
                    maxLength={40}
                    placeholder="Ex.: 40"
                    aria-invalid={!r.label.trim() || duplicated.has(r.label.trim().toLocaleLowerCase('pt-BR'))}
                    onChange={(e) => set(r.key, { label: e.target.value })}
                  />
                </span>
                <span role="cell">
                  <label className="sr-only" htmlFor={`vs-${r.key}`}>
                    Estoque de {r.label || `opção ${i + 1}`}
                  </label>
                  <input id={`vs-${r.key}`} className="input" type="number" inputMode="numeric" min={0} value={r.stock} onChange={(e) => set(r.key, { stock: toStock(e.target.value) })} />
                </span>
                <span role="cell">
                  <label className="vt-check">
                    <input type="checkbox" checked={r.isActive} onChange={(e) => set(r.key, { isActive: e.target.checked })} />
                    <span className="sr-only">Mostrar {r.label} na loja</span>
                  </label>
                </span>
                <span role="cell" className="vt-tools">
                  <button type="button" className="btn btn-outline btn-sm btn-icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir ${r.label}`}>
                    ↑
                  </button>
                  <button type="button" className="btn btn-outline btn-sm btn-icon" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Descer ${r.label}`}>
                    ↓
                  </button>
                  <button type="button" className="btn btn-danger-outline btn-sm btn-icon" onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))} aria-label={`Excluir ${r.label}`}>
                    <CloseIcon />
                  </button>
                </span>
              </div>
            ))}
          </div>
          {duplicated.size > 0 && (
            <p className="err" role="alert">
              Há opções repetidas.
            </p>
          )}
          {presets}
          <p className="notice">
            Total à venda: <b>{total}</b>. Desmarque “Na loja” para esconder uma opção sem apagar o histórico; excluir zera o estoque dela.
          </p>
          <div className="variant-actions">
            {has ? (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirmOff(true)}>
                Voltar a estoque único
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  setRows([]);
                  setEditing(false);
                }}
              >
                Cancelar
              </button>
            )}
            <button type="button" className="btn btn-gold btn-sm" disabled={invalid || !dirty || save.isPending} aria-busy={save.isPending} onClick={submit}>
              Salvar opções
            </button>
          </div>
        </div>
      )}
      {confirmOff && (
        <ConfirmDialog
          title="Voltar a estoque único?"
          message={`As opções de ${type.toLowerCase()} serão removidas e o total (${product.stockQuantity}) vira o estoque único do produto.`}
          confirmLabel="Remover opções"
          danger
          busy={save.isPending}
          onConfirm={() => save.mutate({ variantType: null, variants: [] })}
          onCancel={() => setConfirmOff(false)}
        />
      )}
    </section>
  );
}
