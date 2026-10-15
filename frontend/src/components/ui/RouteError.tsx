import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

const RELOAD_KEY = 'podium:chunk-reload';

/** Depois de um deploy, a aba aberta pode pedir um arquivo de página que não existe mais. */
function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically/i.test(message);
}

/** Tela de erro das rotas: evita a página em branco quando algo quebra durante a renderização. */
export default function RouteError() {
  const error = useRouteError();
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    if (!chunkError) {
      console.error(error);
      return;
    }
    // Recarrega uma vez para buscar a versão nova; se falhar de novo logo em seguida, mostra a tela.
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      // sessionStorage indisponível: segue para a tela de erro.
    }
  }, [chunkError, error]);

  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <div className="route-error" role="alert">
      <h1>{notFound ? 'Página não encontrada' : chunkError ? 'O site foi atualizado' : 'Algo deu errado'}</h1>
      <p>{chunkError ? 'Recarregue a página para usar a versão mais recente.' : 'Tente recarregar a página. Se continuar, fale com a loja pelo WhatsApp.'}</p>
      <div className="route-error-actions">
        <button
          type="button"
          className="btn btn-gold"
          onClick={() => {
            try {
              sessionStorage.removeItem(RELOAD_KEY);
            } catch {
              // ignora
            }
            window.location.reload();
          }}
        >
          Recarregar
        </button>
        <a href="/" className="btn btn-outline">
          Ir para o início
        </a>
      </div>
    </div>
  );
}
