import { defineConfig, loadEnv, type Plugin } from 'vite-plus';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const publicPages = ['/', '/guide', '/sponsor'];

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
      this.emitFile({
        type: 'asset',
        fileName: 'llms.txt',
        source: `# GPT Image Studio

> 开源的 GPT Image 网页工作台，支持文生图、参考图编辑和本地历史记录。

## 使用

- [工作台](${origin}/)
- [使用指南](${origin}/guide)

## 项目文档

- [使用说明与数据保存](https://raw.githubusercontent.com/Cansiny0320/gpt-image-studio/main/docs/usage.md)
- [配置与自部署](https://raw.githubusercontent.com/Cansiny0320/gpt-image-studio/main/docs/hosting.md)
`,
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
