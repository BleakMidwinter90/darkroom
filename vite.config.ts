import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Everything runs client-side, so the whole app is a static bundle that can
  // be served from any host — or opened from a file, or run offline.
  base: './',
  build: { target: 'es2022' },
});
