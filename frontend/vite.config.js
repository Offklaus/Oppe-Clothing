import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento o Vite repassa /api e /images para o Express (porta 3001).
const API = process.env.VITE_API_PROXY ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': API,
      '/images': API
    }
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': API,
      '/images': API
    }
  }
});
