import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RouteError from '../components/ui/RouteError';

function Boom({ error }: { error: Error }): never {
  throw error;
}

function renderWithError(error: Error) {
  const router = createMemoryRouter([{ path: '/', element: <Boom error={error} />, errorElement: <RouteError /> }]);
  return render(<RouterProvider router={router} />);
}

describe('RouteError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('mostra uma tela de erro em vez da página em branco', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderWithError(new Error('falha qualquer'));
    expect(screen.getByRole('heading', { name: 'Algo deu errado' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o início' })).toHaveAttribute('href', '/');
  });

  it('recarrega uma única vez quando falta um arquivo de página após um deploy', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reload = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });

    const { unmount } = renderWithError(new TypeError('Failed to fetch dynamically imported module: /assets/CatalogPage-abc.js'));
    expect(screen.getByRole('heading', { name: 'O site foi atualizado' })).toBeInTheDocument();
    expect(reload).toHaveBeenCalledTimes(1);
    unmount();

    // Falhou de novo logo depois do recarregamento: mostra a tela sem entrar em laço.
    renderWithError(new TypeError('Failed to fetch dynamically imported module: /assets/CatalogPage-abc.js'));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
