import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// On CI we deploy under the repo path (e.g. /video-progressive-blur/).
// Locally we use '/'. Override with VITE_BASE for custom domains or forks.
const base = process.env.VITE_BASE ?? (process.env.GITHUB_PAGES ? '/video-progressive-blur/' : '/');

export default defineConfig({
  plugins: [react()],
  base,
});
