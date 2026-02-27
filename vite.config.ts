import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import pkg from './package.json';

export default defineConfig(() => {
  const now = new Date();
  const buildDate = now.toISOString().split('T')[0].replace(/-/g, '');
  const buildTime = now.getHours().toString().padStart(2, '0') + now.getMinutes().toString().padStart(2, '0');

  return {
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
      'import.meta.env.VITE_APP_BUILD': JSON.stringify(`${buildDate}.${buildTime}`),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
