import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useProducts } from '../../hooks/useStoreData';
import type { ProductQuery } from '../../lib/store-api';
import { whatsappLink } from '../../lib/whatsapp';
import type { Category, InfoItem, Product, StoreContent } from '../../types/api';
import { ErrorState } from '../ui/States';
import { CategoryGlyph, InfoGlyph, WhatsAppLogo } from '../ui/Icons';
import { SmartLink } from '../ui/SmartLink';
import { ProductCard, ProductGridSkeleton } from './ProductCard';

const pad = (n: number) => String(n).padStart(2, '0');

export function InfoStrip({ items, className, label }: { items: InfoItem[]; className: 'benefits' | 'trust'; label: string }) {
  if (items.length === 0) return null;
  return (
    <section className={className} aria-label={label}>
      <ul className="wrap">
        {items.map((b, i) => (
          <li className="ben" key={i} data-reveal>
            {className === 'benefits' && (
              <span className="ben-num" aria-hidden>
                {pad(i + 1)}
              </span>
            )}
            <InfoGlyph icon={b.icon} />
            <div>
              <b>{b.title}</b>
              <span>{b.text}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Cabeçalho de seção: rótulo numerado ("01 — DESTAQUES", numeração automática por CSS conforme as seções
 * visíveis) e título grande em Archivo condensada. `aside` fica à direita no computador.
 */
export function SectionHead({ eyebrow, title, id, aside }: { eyebrow: string; title: ReactNode; id?: string; aside?: ReactNode }) {
  return (
    <div className="sec-head" data-reveal>
      <div className="sec-head-main">
        <span className="eyebrow sec-num">{eyebrow}</span>
        <h2 id={id} className="display">
          {title}
        </h2>
      </div>
      {aside && <div className="sec-head-aside">{aside}</div>}
    </div>
  );
}

/** Mantido para páginas que só precisam de um título simples. */
export function SectionTitle({ children, id }: { children: string; id?: string }) {
  return (
    <h2 id={id} className="sec-title display" data-reveal>
      {children}
    </h2>
  );
}

/** Ordem visual do pódio: 1º no centro, 2º à esquerda, 3º à direita, 4º e 5º nas pontas. */
function podiumOrder(n: number) {
  const order: number[] = [];
  for (let rank = 1; rank <= n; rank++) {
    if (rank === 1) order.push(rank);
    else if (rank % 2 === 0) order.unshift(rank);
    else order.push(rank);
  }
  return order;
}

const RANK_LABEL: Record<number, string> = { 1: 'Ouro', 2: 'Prata', 3: 'Bronze' };

/** Destaques no formato de pódio: os produtos sobem em degraus conforme a posição. */
export function Podium({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  const products = useProducts({ featured: true, pageSize: 5 });
  if (products.isSuccess && products.data.items.length === 0) return null;
  const items = products.data?.items ?? [];
  const order = podiumOrder(items.length);
  return (
    <section className="sec" aria-label={eyebrow || title}>
      <div className="wrap">
        <SectionHead
          eyebrow={eyebrow}
          title={title}
          aside={
            <>
              {text && <p>{text}</p>}
              <Link to="/produtos" className="link-arrow">
                Ver catálogo completo →
              </Link>
            </>
          }
        />
        {products.isPending && <ProductGridSkeleton count={5} />}
        {products.isError && <ErrorState error={products.error} onRetry={() => products.refetch()} />}
        {items.length > 0 && (
          <>
            <ol className="podium" style={{ '--n': items.length } as CSSProperties}>
              {items.map((p: Product, i) => {
                const rank = i + 1;
                return (
                  <li key={p.id} className={`podium-item ${rank > 3 ? 'rest' : ''}`} data-rank={rank} style={{ '--o': order.indexOf(rank) } as CSSProperties}>
                    <span className="rank-tag" aria-hidden>
                      {rank}
                    </span>
                    <ProductCard product={p} index={i} />
                    <div className="step" aria-hidden>
                      <span className="step-num">{rank}</span>
                      {RANK_LABEL[rank] && <span className="step-label">{RANK_LABEL[rank]}</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="podium-ground" aria-hidden />
          </>
        )}
      </div>
    </section>
  );
}

export function CategoryTiles({ categories }: { categories: Category[] }) {
  return (
    <div className="cats">
      {categories.map((c, i) => (
        <Link
          key={c.id}
          to={`/produtos?categoria=${c.slug}`}
          className={`tile ${c.imageUrl ? 'has-photo' : ''}`}
          data-reveal
          style={
            {
              '--g': `radial-gradient(circle at 70% 18%,${c.colorFrom},${c.colorTo} 78%)`,
              // Palavra mais longa do nome: o título encolhe para caber numa linha sem quebrar no meio.
              '--len': Math.max(...c.name.split(/\s+/).map((w) => w.length)),
              ...(c.imageUrl ? { '--g-img': `url("${encodeURI(c.imageUrl)}")` } : {}),
            } as CSSProperties
          }
        >
          {!c.imageUrl && <CategoryGlyph icon={c.icon} className="tile-mark" strokeWidth={0.7} />}
          <span className="tile-top">
            <span aria-hidden>{pad(i + 1)}</span>
            {c.productCount !== undefined && <span>{c.productCount} produtos</span>}
          </span>
          <span className="tile-foot">
            <b>{c.name}</b>
            <small>Ver produtos →</small>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function CategoriesSection({ tiles, others }: { tiles: Category[]; others: Category[] }) {
  return (
    <section className="sec" aria-labelledby="cats-title">
      <div className="wrap">
        <SectionHead
          eyebrow="Categorias"
          id="cats-title"
          title="Escolha sua modalidade"
          aside={
            others.length > 0 && (
              <div className="also">
                <span>Também:</span>
                {others.map((c) => (
                  <Link key={c.id} to={`/produtos?categoria=${c.slug}`} className="also-chip">
                    {c.name}
                    {c.productCount !== undefined && <span aria-hidden>{c.productCount}</span>}
                  </Link>
                ))}
              </div>
            )
          }
        />
        <CategoryTiles categories={tiles} />
      </div>
    </section>
  );
}

/** Faixa escura com o chamado e as marcas correndo em letreiro. */
export function BrandBanner({ data }: { data: StoreContent['brandBanner'] }) {
  if (!data.enabled) return null;
  return (
    <section className="brandband" aria-label="Marcas">
      <div className="wrap brandband-inner">
        <div data-reveal>
          {data.kicker && <span className="kicker">{data.kicker}</span>}
          <h2 className="display">
            {data.title} {data.highlight && <span>{data.highlight}</span>}
          </h2>
        </div>
        <div className="brandband-side" data-reveal>
          {data.text && <p>{data.text}</p>}
          {data.buttonLabel && data.buttonUrl && (
            <SmartLink to={data.buttonUrl} className="btn btn-gold">
              {data.buttonLabel}
            </SmartLink>
          )}
        </div>
      </div>
      {data.brands.length > 0 && (
        <div className="marquee">
          <ul className="marquee-track" aria-label="Marcas disponíveis">
            {data.brands.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <ul className="marquee-track" aria-hidden>
            {data.brands.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

interface ShowcaseTab {
  id: string;
  label: string;
  query: ProductQuery;
  moreLink: string;
  /** Novidades: a contagem é a dos itens exibidos, não a do catálogo inteiro. */
  countShown?: boolean;
}

function ShowcaseCount({ tab }: { tab: ShowcaseTab }) {
  const products = useProducts(tab.query);
  if (!products.data) return null;
  return <span className="tab-count">{pad(tab.countShown ? products.data.items.length : products.data.total)}</span>;
}

/** Vitrine com abas (Ofertas / Novidades), cada uma com sua contagem. */
export function Showcase({ tabs }: { tabs: ShowcaseTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? '');
  const baseId = useId();
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  const products = useProducts(current?.query ?? {});
  if (!current) return null;
  const tabId = (id: string) => `${baseId}-tab-${id}`;
  return (
    <section className="sec" aria-label="Vitrine">
      <div className="wrap">
        <div className="tabs-head" data-reveal>
          <span className="eyebrow sec-num">Vitrine</span>
          <div className="tabs" role="tablist" aria-label="Vitrine">
            {tabs.map((t) => (
              <button
                key={t.id}
                id={tabId(t.id)}
                type="button"
                role="tab"
                className="tab"
                aria-selected={t.id === current.id}
                aria-controls={`${baseId}-panel`}
                onClick={() => setActive(t.id)}
              >
                {t.label}
                <ShowcaseCount tab={t} />
              </button>
            ))}
          </div>
          <Link to={current.moreLink} className="link-arrow">
            Ver todos →
          </Link>
        </div>
        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={tabId(current.id)}>
          {products.isPending && <ProductGridSkeleton count={5} />}
          {products.isError && <ErrorState error={products.error} onRetry={() => products.refetch()} />}
          {products.data &&
            (products.data.items.length === 0 ? (
              <p className="noresult">Nada por aqui no momento.</p>
            ) : (
              <div className="grid">
                {products.data.items.map((p, i) => (
                  <ProductCard key={p.id} product={p} index={i} />
                ))}
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}

/** Atendimento: chamado para o WhatsApp com uma conversa ilustrativa ao lado. */
export function CtaBand({ data, whatsappNumber, greeting, storeName }: { data: StoreContent['cta']; whatsappNumber: string; greeting: string; storeName: string }) {
  if (!data.enabled) return null;
  return (
    <section className="sec" aria-label="Atendimento">
      <div className="wrap">
        <div className="help" data-reveal>
          <div className="help-copy">
            <span className="eyebrow sec-num">Atendimento</span>
            <h2 className="display">{data.title}</h2>
            {data.text && <p>{data.text}</p>}
            <a className="btn btn-wa" href={whatsappLink(whatsappNumber, greeting)} target="_blank" rel="noopener noreferrer">
              <WhatsAppLogo width={20} height={20} />
              {data.buttonLabel}
            </a>
          </div>
          <div className="chat" aria-hidden>
            <p className="bubble me">
              Oi! Vi uma chuteira no site. Tem no 41?<time>14:02</time>
            </p>
            <p className="bubble them">
              Tem sim! Já deixo separada pra você retirar hoje ou mandamos aí?<time>14:03 · {storeName}</time>
            </p>
            <p className="bubble me">
              Retiro no fim da tarde 🙌<time>14:03</time>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
