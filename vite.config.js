import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      input: {
        index: 'index.html',
        mapping: 'mapping.html',
        livin: 'livin.html'
      }
    }
  }
});
