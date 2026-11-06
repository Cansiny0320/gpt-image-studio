import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export const Route = createFileRoute('/guide')({
  head: () => ({
    meta: [
      { title: 'GPT Image Studio 使用指南 · 文生图、参考图编辑与备份' },
      {
        name: 'description',
        content:
          '了解如何在 GPT Image Studio 输入提示词生图、上传参考图编辑、使用流式预览，以及导出或导入本地历史。',
      },
    ],
    links: [{ rel: 'canonical', href: `${import.meta.env.VITE_SITE_ORIGIN}/guide` }],
  }),
  component: Guide,
});

function Guide() {
  return (
    <main className="info-page guide-page">
      <Link to="/" className="nav-link">
        <ArrowLeft size={16} />
        返回工作台
      </Link>
      <h1>GPT Image Studio 使用指南</h1>
      <p>
        GPT Image Studio 是一个开源的 GPT Image 网页工作台，支持文生图和参考图编辑。
        在线工作台免费使用，无需登录或填写自己的 API key。
      </p>

      <h2>怎样用提示词生成图片？</h2>
      <p>
        在工作台选择「文生图」，写下想要的画面，按需选择模型、尺寸和图片数量，再点击「生成图片」。
        每次最多生成 3 张。支持流式预览的模型和输出格式可以在生成过程中显示中间图。
      </p>
      <p>可以先试这条提示词「雨后街角的花店，暖黄色灯光从橱窗透出，地面积水映出招牌，横向胶片摄影」。</p>

      <h2>怎样上传参考图并修改局部？</h2>
      <p>
        选择「图片编辑」，上传参考图并说明要修改的部分和要保留的细节，例如「把杯子换成深蓝色，保留桌面和光线」。
        如需指定区域，可上传遮罩 PNG，也可以用标注 PNG 指出需要修改的位置。
      </p>

      <h2>怎样保存图片和迁移历史记录？</h2>
      <p>
        生成后可在预览区下载图片。工作台的历史记录保存在当前浏览器，包含图片、提示词和生成参数。
        换设备或清理浏览器数据前，可在「历史记录」中导出 ZIP，需要恢复时再导入。
      </p>
      <p>
        站点也会归档生成结果和对应的提示词。上传限制、输出格式及存档细节见{' '}
        <a href="https://github.com/Cansiny0320/gpt-image-studio/blob/main/docs/usage.md">项目使用文档</a>。
      </p>
    </main>
  );
}
