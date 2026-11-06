import { createFileRoute } from '@tanstack/react-router';
import { Studio } from '../components/studio';
export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'GPT Image Studio · 在线 GPT 生图与图片编辑' },
      {
        name: 'description',
        content: '开源 GPT Image 工作台。输入提示词生成图片，上传参考图编辑，支持流式预览和浏览器本地历史。',
      },
      ...(import.meta.env.VITE_SITE_ORIGIN === 'https://image.cansiny.top'
        ? [{ name: 'baidu-site-verification', content: 'codeva-eq1GwrAYv2' }]
        : []),
    ],
    links: [{ rel: 'canonical', href: `${import.meta.env.VITE_SITE_ORIGIN}/` }],
  }),
  component: Studio,
});
