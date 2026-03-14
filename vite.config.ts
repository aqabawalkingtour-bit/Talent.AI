import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  
  return {
    // 1. SET THE BASE PATH (Crucial for GitHub Pages)
    base: '/Talent.AI/', 

    // 2. ADD BOTH PLUGINS
    plugins: [react(), tailwindcss()],

    // 3. DEFINE YOUR SECRETS
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL),
      'process.env.SUPABASE_KEY': JSON.stringify(env.SUPABASE_KEY),
    },

    // 4. RESOLVE PATHS
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    // 5. SERVER SETTINGS
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
