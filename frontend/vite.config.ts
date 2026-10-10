import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Em desenvolvimento a API roda em http://localhost:3333 e é acessada pelo mesmo domínio.
    proxy: { '/api': { target: process.env.VITE_DEV_API_PROXY ?? 'http://localhost:3333', changeOrigin: false } },
  },
  preview: { port: 4173 },
  build: { sourcemap: false, chunkSizeWarningLimit: 600 },
});
