import { defineConfig, loadEnv, type Plugin } from 'vite-plus';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const publicPages = ['/', '/sponsor'];

function searchAssets(origin: string): Plugin {
  return {
    name: 'search-assets',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
      });
      const urls = publicPages.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const { VITE_SITE_ORIGIN } = loadEnv(mode, process.cwd(), 'VITE_SITE_ORIGIN');
  const origin = new URL(VITE_SITE_ORIGIN || 'https://image.cansiny.top').origin;

  return {
    define: { 'import.meta.env.VITE_SITE_ORIGIN': JSON.stringify(origin) },
    server: { strictPort: true },
    plugins: [
      cloudflare({ viteEnvironment: { name: 'ssr' } }),
      tanstackStart({
        pages: publicPages.map((path) => ({ path })),
        prerender: {
          enabled: true,
          autoStaticPathsDiscovery: false,
          crawlLinks: false,
          autoSubfolderIndex: false,
        },
      }),
      react(),
      tailwindcss(),
      searchAssets(origin),
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
  };
});
