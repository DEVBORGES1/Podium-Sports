import { Link } from 'react-router';
import logo from '../../assets/logo.png';
import { whatsappLink } from '../../lib/whatsapp';
import type { Category, StoreSettings } from '../../types/api';
import { FacebookIcon, InfoGlyph, InstagramIcon, TikTokIcon } from '../ui/Icons';

export function SiteFooter({ settings, categories }: { settings: StoreSettings; categories: Category[] }) {
  const year = new Date().getFullYear();
  const social = [
    { url: settings.instagramUrl, label: 'Instagram', Icon: InstagramIcon },
    { url: settings.facebookUrl, label: 'Facebook', Icon: FacebookIcon },
    { url: settings.tiktokUrl, label: 'TikTok', Icon: TikTokIcon },
  ].filter((s) => s.url);
  const trust = settings.content.trustItems;
  return (
    <footer className="site-footer">
      {trust.length > 0 && (
        <ul className="wrap foot-trust" aria-label="Por que comprar com a gente">
          {trust.map((b, i) => (
            <li key={i}>
              <InfoGlyph icon={b.icon} />
              <div>
                <b>{b.title}</b>
                <span>{b.text}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="wrap foot">
        <div className="brand">
          <img src={settings.logoUrl ?? logo} alt={settings.storeName} />
          <p>{settings.content.footerAbout}</p>
          {social.length > 0 && (
            <div className="social">
              {social.map(({ url, label, Icon }) => (
                <a key={label} href={url!} target="_blank" rel="noopener noreferrer" aria-label={label}>
                  <Icon />
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2>Loja</h2>
          <ul>
            {categories.slice(0, 6).map((c) => (
              <li key={c.id}>
                <Link to={`/produtos?categoria=${c.slug}`}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2>Atendimento</h2>
          <ul>
            {settings.content.serviceNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
            {settings.openingHours && <li>{settings.openingHours}</li>}
          </ul>
        </div>
        <div>
          <h2>Contato</h2>
          <ul>
            <li>
              <a className="mono" href={whatsappLink(settings.whatsappNumber, settings.whatsappGreeting)} target="_blank" rel="noopener noreferrer">
                {settings.phoneDisplay ?? settings.whatsappNumber}
              </a>
            </li>
            {settings.email && (
              <li>
                <a href={`mailto:${settings.email}`}>{settings.email}</a>
              </li>
            )}
            {settings.address && <li>{settings.address}</li>}
            {settings.city && <li>{settings.city}</li>}
          </ul>
        </div>
      </div>
      <div className="foot-slogan" aria-hidden>
        <span>Supere seus limites</span>
      </div>
      <div className="copy">
        <div className="wrap">
          <span>
            © {year} {settings.storeName}
            {settings.city ? ` · ${settings.city}` : ''}
          </span>
          <span>Pedidos finalizados pelo WhatsApp</span>
        </div>
      </div>
    </footer>
  );
}
