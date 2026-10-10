import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { whatsappLink } from '../../lib/whatsapp';
import type { Category, InfoItem, StoreContent } from '../../types/api';
import { CategoryGlyph, InfoGlyph } from '../ui/Icons';
import { SmartLink } from '../ui/SmartLink';

export function InfoStrip({ items, className, label }: { items: InfoItem[]; className: 'benefits' | 'trust'; label: string }) {
  if (items.length === 0) return null;
  return (
    <section className={className} aria-label={label}>
      <ul className="wrap" style={{ listStyle: 'none' }}>
        {items.map((b, i) => (
          <li className="ben" key={i} data-reveal>
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

export function SectionTitle({ children, id }: { children: string; id?: string }) {
  return (
    <h2 id={id} data-reveal>
      <span className="slash" aria-hidden>
        ///
      </span>{' '}
      {children}{' '}
      <span className="slash" aria-hidden>
        ///
      </span>
    </h2>
  );
}

export function CategoryTiles({ categories }: { categories: Category[] }) {
  return (
    <div className="cats">
      {categories.map((c) => (
        <Link
          key={c.id}
          to={`/produtos?categoria=${c.slug}`}
          className={`tile ${c.imageUrl ? 'has-photo' : ''}`}
          data-reveal
          style={
            {
              '--g': `radial-gradient(circle at 30% 20%,${c.colorFrom},${c.colorTo})`,
              ...(c.imageUrl ? { '--g-img': `url("${encodeURI(c.imageUrl)}")` } : {}),
            } as CSSProperties
          }
        >
          <span className="ic" aria-hidden>
            <CategoryGlyph icon={c.icon} />
          </span>
          <b>{c.name}</b>
          <small>Ver produtos</small>
        </Link>
      ))}
    </div>
  );
}

export function BrandBanner({ data }: { data: StoreContent['brandBanner'] }) {
  if (!data.enabled) return null;
  return (
    <section className="banner" data-reveal aria-label="Marcas">
      <div>
        {data.kicker && <div className="kicker">{data.kicker}</div>}
        <h3>
          {data.title} {data.highlight && <span>{data.highlight}</span>}
        </h3>
        {data.text && <p>{data.text}</p>}
        {data.buttonLabel && data.buttonUrl && (
          <SmartLink to={data.buttonUrl} className="btn btn-gold">
            {data.buttonLabel}
          </SmartLink>
        )}
      </div>
      {data.brands.length > 0 && (
        <ul className="brands" aria-label="Marcas disponíveis">
          {data.brands.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CtaBand({ data, whatsappNumber, greeting }: { data: StoreContent['cta']; whatsappNumber: string; greeting: string }) {
  if (!data.enabled) return null;
  return (
    <section className="cta" data-reveal aria-label="Atendimento">
      <div className="seal" aria-hidden>
        <InfoGlyph icon="whatsapp" width={30} height={30} />
      </div>
      <div>
        <h3>{data.title}</h3>
        <p>{data.text}</p>
      </div>
      <a className="btn btn-dark" href={whatsappLink(whatsappNumber, greeting)} target="_blank" rel="noopener noreferrer">
        {data.buttonLabel}
      </a>
    </section>
  );
}
