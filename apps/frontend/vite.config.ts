import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import basicSsl from '@vitejs/plugin-basic-ssl';

// The backend is HTTPS-only and Chrome treats http://localhost and https://localhost as
// different sites, so the SameSite=Lax session cookie is only sent when the frontend is HTTPS too.
export default defineConfig({
  plugins: [vue(), basicSsl()],
  server: {
    port: 5173,
    host: true,
  },
});
