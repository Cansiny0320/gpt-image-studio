import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import '../styles.css';
export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    links: [{ rel: 'icon', type: 'image/png', sizes: '64x64', href: '/favicon.png' }],
  }),
  shellComponent: ({ children }) => (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  ),
  component: Outlet,
  notFoundComponent: () => (
    <main className="page-error">
      <h1>页面不存在</h1>
      <a href="/">返回工作台</a>
    </main>
  ),
  errorComponent: ({ reset }) => (
    <main className="page-error">
      <h1>页面暂时无法显示</h1>
      <button onClick={reset}>重试</button>
    </main>
  ),
});
