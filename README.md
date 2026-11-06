<h1 align="center">GPT Image Studio</h1>
<p align="center">GPT Image 生图与图片编辑，支持流式预览、本地历史和 Cloudflare 自部署。</p>
<p align="center">
  <a href="https://github.com/Cansiny0320/gpt-image-studio/actions/workflows/check.yml"><img src="https://github.com/Cansiny0320/gpt-image-studio/actions/workflows/check.yml/badge.svg" alt="Checks"></a>
</p>
<p align="center">简体中文 · <a href="README.en.md">English</a></p>
<p align="center">
  <a href="https://image.cansiny.top">在线使用</a> ·
  <a href="docs/hosting.md">部署说明</a> ·
  <a href="https://github.com/Cansiny0320/gpt-image-studio/issues">问题反馈</a> ·
  <a href="#赞赏">赞赏</a>
</p>

## 在线使用

访问 [image.cansiny.top](https://image.cansiny.top)，输入提示词即可生成图片，无需登录或填写 API key。

支持文生图、参考图编辑、遮罩 / 标注 PNG 上传、流式预览，每次最多生成 3 张图片。尺寸、质量、背景、输出格式等参数随模型切换，高级选项按需展开。

生成结果可以下载或继续编辑。历史记录保存在当前浏览器，包含完整提示词、参数和图片，支持 ZIP 导出与导入。

## 本地运行

需要 Node.js 24.11+、pnpm 10，以及具有目标图片模型访问权限的 OpenAI API key。

```bash
git clone https://github.com/Cansiny0320/gpt-image-studio.git
cd gpt-image-studio
pnpm install --frozen-lockfile
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

在 `apps/web/.dev.vars` 中设置 `OPENAI_API_KEY`，然后启动：

```bash
pnpm db:local
pnpm dev
```

打开 [127.0.0.1:4327](http://127.0.0.1:4327)。本地使用模拟 D1 / R2 和 Turnstile 官方测试 key，不写入线上存储。

## 自部署

部署需要 Cloudflare Workers、D1、私有 R2 bucket 和 Turnstile。先按 [部署说明](docs/hosting.md) 配置自己的资源、域名和 Worker Secrets，再执行：

```bash
pnpm --filter @studio/web exec wrangler d1 migrations apply studio-archive --remote
pnpm run deploy
```

仓库中的资源配置属于当前站点，部署到自己的账户前必须替换。GitHub Actions 只运行检查，不自动部署。

## 几点说明

- API key 仅保存在服务端。生图请求经过 Worker，访客通过 Turnstile 验证后调用。
- 服务端会另存提示词和最终图片作为私有档案，不提供访客读取或恢复历史的接口。删除本地历史不会删除服务端档案；档案不自动过期。
- 清理浏览器数据会丢失本地历史，重要作品请下载或导出备份。上传的参考图、遮罩、标注和中间预览不留档。
- 模型能力取决于 API 项目权限。SVG / GIF 预览能力默认关闭，上传大小等站点限制见 [使用说明](docs/usage.md)。

## 开发

使用 TypeScript、React 19、TanStack Start / Router、Tailwind CSS v4、Base UI / shadcn、Zustand、oRPC、Drizzle 和 Cloudflare Workers / D1 / R2，通过 pnpm workspace 与 Vite+ 构建。

运行 `pnpm test` 执行测试，`pnpm build` 构建，`pnpm verify` 执行 lint、格式检查、类型检查、测试和构建。首次检查前先运行一次 `pnpm build`，生成路由类型。

界面交互参考 [GPT Image Playground](https://github.com/CookSleep/gpt_image_playground)，实现独立编写。设计与实施记录见 [spec](docs/spec.md) 和 [plan](docs/plan.md)。

## 反馈

有问题可以提 [Issue](https://github.com/Cansiny0320/gpt-image-studio/issues)，附上复现步骤、浏览器、模型和报错信息。请勿提交 API key、私密提示词或图片。

## 赞赏

觉得好用的话，欢迎通过微信或支付宝支持一下。也可以打开网站的 [赞赏页面](https://image.cansiny.top/sponsor)。

![微信与支付宝赞赏二维码](apps/web/public/sponsorship.png)
