import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { OPENAPI_PATH } from '../src/app.js';
import { api, makeApp } from './helpers.js';

/** Garante que toda rota declarada no código está documentada no OpenAPI (evita documentação desatualizada). */
function declaredRoutes() {
  const root = join(import.meta.dirname, '../src/modules');
  const routes: string[] = [];
  for (const dir of readdirSync(root)) {
    for (const file of readdirSync(join(root, dir)).filter((f) => f.endsWith('.routes.ts'))) {
      const src = readFileSync(join(root, dir, file), 'utf8');
      for (const m of src.matchAll(/(\w+)Router\.(get|post|patch|put|delete)\(\s*'([^']+)'/g)) {
        const [, router, method, path] = m;
        const isAdmin = router!.startsWith('admin') || router === 'uploads';
        const openapiPath = (isAdmin ? '/admin' : '') + path!.replace(/:(\w+)/g, '{$1}');
        routes.push(`${method} ${openapiPath}`);
      }
    }
  }
  return routes;
}

describe('documentação OpenAPI', () => {
  const spec = YAML.parse(readFileSync(OPENAPI_PATH, 'utf8'));

  it('documenta todas as rotas da API', () => {
    const routes = declaredRoutes();
    expect(routes.length).toBeGreaterThan(40);
    const missing = routes.filter((r) => {
      const [method, path] = r.split(' ');
      return !spec.paths[path!]?.[method!];
    });
    expect(missing).toEqual([]);
  });

  it('é servida em /api/v1/openapi.json', async () => {
    const res = await api(makeApp()).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.info.title).toBe('Podium Sports API');
  });
});
