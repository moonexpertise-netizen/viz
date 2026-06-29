import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En dev local on lance `vercel dev` (front + fonctions /api sur le meme port).
// Si on lance `vite` seul, on proxy /api vers `vercel dev` sur le port 3000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
