import { useEffect } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Página não encontrada');
  // O site responde 200 para qualquer endereço (SPA): o noindex evita que buscadores indexem a página de erro.
  useEffect(() => {
    const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previous = robots?.content;
    robots?.setAttribute('content', 'noindex, follow');
    return () => {
      if (robots && previous) robots.setAttribute('content', previous);
    };
  }, []);
  return (
    <div className="wrap not-found">
      <h1>404</h1>
      <p>Essa página saiu de campo. Que tal voltar para a loja?</p>
      <Link to="/" className="btn btn-gold">
        Ir para o início
      </Link>
    </div>
  );
}
