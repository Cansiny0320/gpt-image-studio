import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export const Route = createFileRoute('/guide')({
  head: () => ({
    meta: [
      { title: 'GPT Image Studio 使用指南 · 免登录生图与参考图编辑' },
      {
        name: 'description',
        content:
          '用 GPT Image Studio 免登录在线生图，无需填写自己的 API Key。查看参考图局部编辑的实测原图、完整提示词和结果。',
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
        在线工作台免费使用，无需登录或填写自己的 API Key。
      </p>

      <h2>如何免登录用 GPT Image 在线生图？</h2>
      <p>
        在工作台选择「文生图」，写下想要的画面，按需选择模型、尺寸和图片数量，再点击「生成图片」。
        每次最多生成 3 张。支持流式预览的模型和输出格式可以在生成过程中显示中间图。
      </p>
      <p>可以先试这条提示词「雨后街角的花店，暖黄色灯光从橱窗透出，地面积水映出招牌，横向胶片摄影」。</p>

      <h2>怎样上传参考图并修改局部？</h2>
      <p>
        选择「图片编辑」，上传参考图，在提示词里写清楚要修改的区域和要保留的细节，再点击「生成图片」。
        参考图支持 PNG、JPEG 和 WebP，单张不超过 10
        MB。需要圈定区域时，可上传与第一张参考图同尺寸、带透明通道的遮罩 PNG。 支持标注的模型也可使用标注
        PNG。
      </p>

      <h3 id="reference-edit-example" className="mt-5 mb-2 font-semibold">
        马克杯换色实测
      </h3>
      <p>
        2026 年 11 月 7 日在 GPT Image Studio 线上实测，使用 <code>gpt-image-2.6-flare</code>、1024 × 1024、
        中等画质，输出 WebP。上传一张参考图，通过提示词指定修改范围。
      </p>
      <blockquote className="mt-3 border-l-2 pl-3">
        只将插画中珊瑚红色马克杯的杯身、杯沿和杯把改为深蓝色。保留浅米色背景、杯把的位置、杯身白色星形标记和杯底阴影，不要添加文字或其他物体。
      </blockquote>
      <div className="my-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <figure>
          <img
            src="/guide-images/mug-reference.jpg"
            alt="浅米色背景下的珊瑚红马克杯，杯身有白色星形标记"
            width={1024}
            height={1024}
            loading="lazy"
            className="block h-auto w-full rounded-md"
          />
          <figcaption className="mt-1 text-sm">原图</figcaption>
        </figure>
        <figure>
          <img
            src="/guide-images/mug-edited.webp"
            alt="编辑后的深蓝色马克杯，保留白色星形标记、右侧杯把和杯底阴影"
            width={1024}
            height={1024}
            loading="lazy"
            className="block h-auto w-full rounded-md"
          />
          <figcaption className="mt-1 text-sm">本站编辑结果</figcaption>
        </figure>
      </div>
      <p>本次结果中，杯身、杯沿和杯把变为深蓝色，白色星形标记、杯把位置、浅米色背景和杯底阴影都保留了。</p>

      <h2>怎样保存图片和迁移历史记录？</h2>
      <p>
        生成后可在预览区下载图片。工作台的历史记录保存在当前浏览器，包含图片、提示词和生成参数。
        换设备或清理浏览器数据前，可在「历史记录」中导出 ZIP，需要恢复时再导入。
      </p>
      <p>
        站点会将提示词、生成结果和图片编辑的原始参考图存入私有存档，已归档的数据不会自动过期。
        上传限制、输出格式及存档细节见{' '}
        <a href="https://github.com/Cansiny0320/gpt-image-studio/blob/main/docs/usage.md">项目使用文档</a>。
      </p>
    </main>
  );
}
