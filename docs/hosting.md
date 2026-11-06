# 开发与部署

[返回 README](../README.md) · [English](hosting.en.md)

## 本地开发

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

打开 [127.0.0.1:4327](http://127.0.0.1:4327)。本地使用模拟 D1 / R2，不写入线上存储。

本地配置为 `APP_ENV=development`、`APP_ORIGIN=http://127.0.0.1:4327`。

`pnpm db:local` 应用本地迁移，`pnpm dev` 启动开发服务。本地 D1 / R2 数据位于 `apps/web/.wrangler`。真实生图仍会调用 OpenAI API 并产生相应使用量。

| 命令                               | 用途                                         |
| ---------------------------------- | -------------------------------------------- |
| `pnpm test`                        | 参数、安全、流式响应、留档失败与本地备份测试 |
| `pnpm build`                       | 构建和静态页面生成                           |
| `pnpm verify`                      | lint、格式检查、类型检查、测试、构建         |
| `pnpm --filter @studio/web types`  | 修改 Worker bindings 后更新类型              |
| `pnpm --filter @studio/web format` | 格式化源文件，会修改文件                     |

首次单独执行 typecheck 或 verify 前先运行 build，生成 TanStack 路由类型。

## 首次部署到自己的账户

需要已启用 Workers、D1 和 R2 的 Cloudflare 账户、托管在该账户的域名，以及有图片模型权限的 OpenAI API key。

1. 通过 `pnpm --filter @studio/web exec wrangler login` 登录自己的 Cloudflare 账户，并用 `wrangler whoami` 确认身份。
2. 创建 D1 数据库和 R2 bucket。可在 `apps/web` 目录执行 `pnpm exec wrangler d1 create studio-archive` 和 `pnpm exec wrangler r2 bucket create gpt-image-studio-archive`；名称可自行调整。
3. 修改 `apps/web/wrangler.jsonc`，替换下表配置。R2 必须保持私有，不启用公共开发 URL 或自定义域名。

| 配置                          | 设置                                                                 |
| ----------------------------- | -------------------------------------------------------------------- |
| `account_id`                  | 自己的 Cloudflare account ID                                         |
| `name`                        | 自己的 Worker 名称                                                   |
| `routes[].pattern`            | 自己的域名，保留 `custom_domain: true`                               |
| `d1_databases[]`              | 替换数据库名称和 ID，保留 `binding: DB` 与 `migrations_dir: drizzle` |
| `r2_buckets[]`                | 替换 bucket 名称，保留 `binding: IMAGES`                             |
| `vars.APP_ORIGIN`             | 完整 HTTPS origin，不带尾斜杠，须与域名一致                          |
| `vars.APP_ENV`                | `production`                                                         |
| `vars.ENABLE_PREVIEW_FORMATS` | 默认 `false`；仅控制 SVG，确认权限后开启；GIF 已对 2.6 模型开放      |

在 `apps/web` 目录交互式设置 Secrets，不要把 key 写进命令参数、Git 或普通环境变量配置：

```bash
pnpm exec wrangler secret put OPENAI_API_KEY
```

如果 Worker 尚不存在，按 Wrangler 提示创建同名 Worker 后继续。然后回到仓库根目录，应用迁移并部署；若修改了数据库名称，替换命令中的 `studio-archive`：

```bash
pnpm --filter @studio/web exec wrangler d1 migrations apply studio-archive --remote
pnpm run deploy
```

`pnpm run deploy` 先构建，再使用 `dist/server/wrangler.json` 部署，保留已有 Worker Secrets。Custom Domain 由 Cloudflare 配置 DNS 和证书。GitHub Actions 只执行检查，不自动发布。

`.dev.vars` 及构建生成的 `dist/server/.dev.vars` 只用于本地。不要上传整个 dist 目录或把这些文件当作静态资产发布。

## 更新与检查

更新代码后运行 `pnpm build` 和 `pnpm verify`；有新迁移时先应用远程迁移，再运行 `pnpm run deploy`。仅修改 README 或文档无需重新部署。

部署后用浏览器检查 HTTPS、实际生图、刷新后的本地历史和 `/sponsor`。确认 D1 留档完成、R2 保持私有、`OPENAI_API_KEY` Secret 存在。站点没有每日张数配额或全站固定并发上限；API 与 Cloudflare 服务本身的额度仍然适用。

生产环境关闭 workers.dev 与预览 URL。缺失关键配置或来源不匹配时拒绝生图。静态导航和资源由 Workers Static Assets 提供，`/api/*` 进入 Worker。

代码回滚可使用 Cloudflare 控制台的 Worker 版本回滚；它不会回滚 D1 schema、删除存档或恢复浏览器数据。涉及 schema 变更时，先确认旧版本兼容性。

当前数据保存方式和上传限制见 [使用说明](usage.md)。首次本地检查和生产验收分别记录在 [本地验证](verification.md) 与 [上线验证](deployment-verification.md)。

## AI Gateway（可选）

当前站点的生产链路使用下节的东京转发服务。AI Gateway 原生代理作为可选配置保留；实测它未解决本次 CN 来源的地区拒绝。使用网关时，移除 `vars.IMAGE_RELAY_ORIGIN`，再设置自己的 `vars.AI_GATEWAY_ACCOUNT_ID` 与 `vars.AI_GATEWAY_ID`。

网关启用身份验证和 Require provider credentials（BYOK only），关闭日志、Logpush、缓存和自动重试。创建仅具有该账户 AI Gateway Run 权限的 token，然后在 `apps/web` 执行：

```bash
pnpm exec wrangler secret put AI_GATEWAY_TOKEN
```

OpenAI key 仍使用原有 `OPENAI_API_KEY` Secret。应用保留原生 JSON / multipart 请求和流式响应，并强制禁止网关缓存、日志、重试与 Unified Billing 回退。网关配置不完整时会在生图前拒绝请求。配置变更后重新构建、部署；回滚直连时清空两个网关变量即可，保留 token Secret 不会启用网关。

本地 `.dev.vars.example` 中的网关变量默认为空，因此本地默认直连；需要测试网关时填写自己的 ID 和 token。网关能否解决特定来源地区的错误必须实测，部署成功不等于地区问题已解决。设计与验证范围见 [AI Gateway 接入计划](ai-gateway-plan.md)。

## 自有服务器转发（当前生产链路）

链路为浏览器 → Worker → 东京 Nginx → OpenAI。网页、参数校验、去重和 D1/R2 归档仍在 Cloudflare，用户历史仍在浏览器。OpenAI key 保存在 Worker Secret，仅经验证的 HTTPS 连接传递给上游，不写入 VPS 文件。

`vars.IMAGE_RELAY_ORIGIN` 指向自有 HTTPS 转发 origin；`IMAGE_RELAY_TOKEN` 通过 `wrangler secret put IMAGE_RELAY_TOKEN` 设置。网关 ID 与转发 origin 不可同时启用。自部署时请替换为自己的转发服务，或删除转发 origin 和两个网关 ID 以直连 OpenAI，不要沿用本站的转发地址。保留未使用的 token Secret 不会启用任何转发。

[Nginx 示例](../deploy/nginx/image-relay.conf) 仅允许两个图片 POST 接口，要求独立随机 token，关闭请求头透传、重试、缓存及缓冲。只有 Authorization、Content-Type 和固定 Host 发给 OpenAI。将自己的随机 token 写入 root-only 的 `/etc/nginx/snippets/gpt-image-relay-secret.conf`：`set $studio_relay_token "YOUR_RANDOM_TOKEN";`。替换示例域名和证书路径，确认上下游 TLS 校验、证书自动续期、40 MiB 上传限制、端口开放，再通过 `nginx -t` 检查并平滑重载。不得把真实 token 提交 Git。[续期 hook 示例](../deploy/nginx/renew-image-relay.sh) 安装到 Certbot 的 `renewal-hooks/deploy` 后，仅在该证书续期时检查并重载 Nginx。

回滚时清空 `IMAGE_RELAY_ORIGIN` 并重新部署 Worker；停用 VPS 转发前确认已没有生产流量使用它。无需迁移数据库或图片。

## 技术栈与设计

使用 TypeScript、React 19、TanStack Start / Router、Tailwind CSS v4、Base UI / shadcn、Zustand、oRPC、Drizzle 和 Cloudflare Workers / D1 / R2，通过 pnpm workspace 与 Vite+ 构建。

运行 `pnpm test` 执行测试，`pnpm build` 构建，`pnpm verify` 执行 lint、格式检查、类型检查、测试和构建。首次检查前先运行一次 `pnpm build`，生成路由类型。

界面交互参考 [GPT Image Playground](https://github.com/CookSleep/gpt_image_playground)，实现独立编写。设计与实施记录见 [spec](spec.md) 和 [plan](plan.md)。
