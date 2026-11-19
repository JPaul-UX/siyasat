import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development the API runs on its own port; in production it serves this app itself.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
