import { defineConfig } from 'vite-plus';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: { strictPort: true },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart({ spa: { enabled: true, prerender: { outputPath: '/index' } } }),
    react(),
    tailwindcss(),
  ],
  lint: {
    ignorePatterns: [
      'dist/**',
      '.wrangler/**',
      '.tanstack/**',
      'worker-configuration.d.ts',
      'src/routeTree.gen.ts',
    ],
    plugins: ['typescript', 'react', 'jsx-a11y'],
  },
  fmt: {
    singleQuote: true,
    printWidth: 110,
    ignorePatterns: [
      'dist/**',
      '.wrangler/**',
      '.tanstack/**',
      'worker-configuration.d.ts',
      'src/routeTree.gen.ts',
      'pnpm-lock.yaml',
    ],
  },
});
