import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_API_PROXY ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false
  },
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
