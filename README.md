# GPT Image Studio

GPT Image 文生图与图片编辑工作台。使用站点服务端 API key，访客无需登录；提示词、参数和最终图片完整保存在浏览器，服务端另存私有档案。

网站：[image.cansiny.top](https://image.cansiny.top) · [赞赏](https://image.cansiny.top/sponsor)

## 使用

- 文生图、参考图编辑、遮罩 / 标注 PNG 上传、批量生成和流式预览。
- 按模型联动的尺寸、质量、背景、格式、压缩、复杂度、审核和编辑保真度。SVG / GIF 预览能力由服务端显式启用。
- 本地历史、下载、继续编辑、ZIP 导出与导入。历史查看不读取服务器。
- Turnstile 服务端验证、来源检查、请求去重；没有每日张数限制、全站固定并发上限或自动过期。

## 本地运行

需要 Node.js 24.11+ 和 pnpm 10。

```sh
pnpm install --frozen-lockfile
cp apps/web/.dev.vars.example apps/web/.dev.vars
# 仅在 .dev.vars 中配置 OPENAI_API_KEY
pnpm db:local
pnpm dev
```

打开 http://127.0.0.1:4327 。本地 D1 / R2 位于 `apps/web/.wrangler`，不会写入线上资源。`.dev.vars` 使用 Turnstile 官方测试 key，服务端只允许它在 development + localhost 下使用。

```sh
pnpm test        # 参数、安全、流式响应、留档失败、本地备份
pnpm build      # 构建与静态页面生成
pnpm verify     # lint、格式检查、类型检查、测试、构建
```

首次单独运行 typecheck 前先运行 build，生成 TanStack 路由类型。修改 Worker bindings 后运行 `pnpm --filter @studio/web types`。格式化命令为 `pnpm --filter @studio/web format`，会修改文件。

## 部署

生产环境使用 `image.cansiny.top`，配置见 `apps/web/wrangler.jsonc`。D1、私有 R2、Turnstile 已为此项目单独创建；`OPENAI_API_KEY` 和 `TURNSTILE_SECRET_KEY` 保存在 Worker Secrets。

```sh
pnpm --filter @studio/web exec wrangler d1 migrations apply studio-archive --remote
pnpm deploy
```

先确认当前 Cloudflare 账户正确，再执行远程迁移或部署。`pnpm deploy` 构建后使用生成配置部署，保留既有 Worker Secrets。GitHub Actions 只做检查，不自动部署。首次部署到其他账户时需要替换 account、D1、R2、域名和 Turnstile 配置，并通过 Secrets 设置密钥。

`APP_ENV` 在线保持 `production`，Turnstile 仅允许 `image.cansiny.top`。R2 不开放公共访问，workers.dev 和预览 URL 关闭。`ENABLE_PREVIEW_FORMATS=true` 仅在确认 API 项目有 SVG / GIF 权限后开启。缺失必要配置或验证失败时拒绝生图。

`.dev.vars` 只用于本地，切勿将它或 `dist/server/.dev.vars` 上传到 GitHub 或作为公开资产。静态页面导航和资源由 Workers Static Assets 提供，`/api/*` 进入 Worker，参考 [Cloudflare SPA 路由配置](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)。

## 数据与限制

- 浏览器 IndexedDB：完整提示词、生成参数、最终图片 Blob 和时间。删除本地历史不会删除服务端档案，清理浏览器数据后无法从服务端找回。ZIP 备份可迁移历史；默认导出已加载记录，也可选择部分记录。
- D1：提示词、请求状态和必要图片元数据。R2：最终图片原始二进制文件。两者均不提供面向访客的历史读取或读图接口。
- 参考图、遮罩和标注只在当前请求中处理；中间预览不保存。不记录提示词、图片内容或 key 到日志。
- 编辑支持最多 16 张参考图；站点为 Workers 内存设置单文件 10 MB、总请求 24 MB 上限（界面预留开销限制为 23 MB）。单图片响应事件上限 20 MiB。这些是站点处理限制，不代表 OpenAI 的全部上传上限。
- 备份支持最多 256 MB 图片数据，较大历史请选择分批导出。浏览器可能清理站点数据，重要作品建议下载或导出。
- SVG / GIF 不支持流式预览，SVG 仅支持单张文生图。SVG 以 `<img>` 显示，不插入 HTML。GIF 和 SVG 结果可下载，但不能直接用作栅格参考图继续编辑。
- 若连接中断，上游可能已经产生用量；不会自动重新生成。已收到的最终图仍可保存。服务端留档失败会明确提示，不丢弃已生成图片。
- 本地存储写入失败时保留内存副本供下载或重试保存。服务端存档不自动过期。

## 技术栈

TypeScript、React 19、TanStack Start / Router、Tailwind CSS v4、shadcn（base-nova）/ Base UI、Lucide、Zustand、oRPC、Cloudflare Workers / D1 / R2、Drizzle、Vite+、pnpm workspace。

设计及实现计划见 [spec](docs/spec.md) 和 [plan](docs/plan.md)。界面交互参考 [GPT Image Playground](https://github.com/CookSleep/gpt_image_playground)，实现独立编写。

## 赞赏

觉得好用的话，欢迎通过微信或支付宝支持一下。网站右上角「赞赏」打开 `/sponsor`，与 README 使用同一套收款码，来自 [Heybox Daily](https://github.com/Cansiny0320/heybox-daily)。

![微信和支付宝赞赏收款码](apps/web/public/sponsorship.png)
