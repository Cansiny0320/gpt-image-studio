import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
export const Route = createFileRoute('/sponsor')({
  head: () => ({
    meta: [
      { title: '赞赏 · GPT Image Studio' },
      { name: 'description', content: '通过微信或支付宝赞赏，支持开源项目 GPT Image Studio。' },
    ],
    links: [{ rel: 'canonical', href: `${import.meta.env.VITE_SITE_ORIGIN}/sponsor` }],
  }),
  component: Sponsor,
});
function Sponsor() {
  return (
    <main className="sponsor-page">
      <Link to="/" className="nav-link">
        <ArrowLeft size={16} />
        返回工作台
      </Link>
      <h1>赞赏</h1>
      <p>觉得好用的话，欢迎通过微信或支付宝支持一下。</p>
      <a href="/sponsorship.png" target="_blank" rel="noreferrer">
        <img src="/sponsorship.webp" width="1536" height="1024" alt="微信和支付宝赞赏收款码" />
      </a>
      <a href="/sponsorship.png" target="_blank" rel="noreferrer" className="nav-link">
        查看原图
        <ArrowUpRight size={14} />
      </a>
    </main>
  );
}
