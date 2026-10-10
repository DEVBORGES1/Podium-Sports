import { whatsappLink } from '../../lib/whatsapp';
import { WhatsAppLogo } from '../ui/Icons';

export function WhatsAppFab({ number, greeting }: { number: string; greeting: string }) {
  return (
    <a className="fab" href={whatsappLink(number, greeting)} target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp">
      <WhatsAppLogo />
    </a>
  );
}
