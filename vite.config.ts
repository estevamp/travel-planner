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
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (path) => path,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-vendor';
            }

            if (id.includes('@supabase')) {
              return 'supabase';
            }

            if (id.includes('motion') || id.includes('lucide-react') || id.includes('date-fns')) {
              return 'ui-vendor';
            }

            return 'vendor';
          },
        },
      },
    },
  };
});
