import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {geoFromDbPlugin} from './server/gis-catalog/viteGeoDbPlugin';

export default defineConfig(({mode}) => {
  // Load PG / roads API env for the geo-from-DB middleware target.
  const env = loadEnv(mode, process.cwd(), '');
  if (env.ROADS_API_PORT) process.env.ROADS_API_PORT = env.ROADS_API_PORT;
  if (env.ROADS_API_HOST) process.env.ROADS_API_HOST = env.ROADS_API_HOST;

  return {
    plugins: [react(), tailwindcss(), geoFromDbPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Production hostnames for garuda / gis.accessgenie.in (Vite host check).
      allowedHosts: ['gis.accessgenie.in', 'garuda.accessgenie.in', 'localhost', '127.0.0.1'],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${process.env.ROADS_API_PORT || 8787}`,
          changeOrigin: true,
        },
      },
    },
  };
});
