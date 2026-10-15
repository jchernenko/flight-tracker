import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The display is a 2019 Galaxy Tab A; ES2020 keeps the bundle safe for its Chrome.
  build: { target: 'es2020' },
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
});
