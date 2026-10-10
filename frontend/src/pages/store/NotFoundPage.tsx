import { Link } from 'react-router';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Página não encontrada');
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
