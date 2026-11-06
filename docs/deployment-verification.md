# 上线验证

> 历史验证记录；GIF 开放及最新参数检查见 [API 兼容性检查](api-compatibility.md)。

验证日期：2026-11-06。线上地址：[image.cansiny.top](https://image.cansiny.top)。

## 发布与配置

- 应用提交：`3108a89bade4ce47438183d2ee14bcd1525d3995`，已推送至公开 GitHub 仓库 main。
- GitHub Actions：[Checks 42181781565](https://github.com/Cansiny0320/gpt-image-studio/actions/runs/42181781565) 成功。
- 本地 `pnpm verify` 通过，包含 38 项测试；Wrangler 部署预检查通过。
- 生产 D1 已应用 `0001_archive.sql`。
- Worker 版本：`846a1946-7f86-4766-af6a-d959816f8479`，绑定 Custom Domain `image.cansiny.top`，workers.dev 和预览 URL 关闭。
- Worker 中存在 `OPENAI_API_KEY` 和 `TURNSTILE_SECRET_KEY` 两个 Secrets。生产使用真实 Managed Turnstile widget，限定站点域名。
- R2 托管公共域名禁用，自定义域名列表为空。

## 浏览器端到端检查

- HTTPS 工作台可正常打开，真实 Turnstile 自动验证成功。
- 使用 `gpt-image-2.6-flare`、low、1024×1024、PNG 成功生成橘猫插画，页面出现最终图片、下载和继续编辑操作。
- 刷新浏览器后，历史中仍有该提示词及图片；打开历史项恢复生成参数和最终图片。
- 服务端 D1 查询确认 1 个 complete 请求及 1 条最终图片记录。
- `/sponsor` 可从工作台进入，收款码正常显示。
- 本次界面截图保存在会话 outputs 中，未提交到仓库。

## 验证边界

本次线上只实测了上述模型与参数组合，未做负载测试或逐项测量 Workers CPU / 内存；其他模型、SVG / GIF 权限及真实遮罩 / 标注编辑未在线逐项验证。SVG / GIF 仍默认关闭。Token 重放拒绝行为有本地自动测试，尚未用生产 token 完成重放实测。

命令行 HTTP 探测收到 403，浏览器访问及实际生图均成功；该差异原因未确定，未据此修改安全策略，也未将命令行结果视为应用路由验收。

## 交互修复与数量限制

同日后续版本：应用修复 `3aba696`，部署命令修复 `e9bbab3`。Worker 版本为 `2dd61a97-4526-4867-8b66-d361f6be7d26`。

- 移除工作台「关于保存与隐私」区域；数据处理说明保留在 README 和使用文档。
- 所有选项下拉使用 Base UI Select；生成期间禁用选项。
- 单次生成上限为 3 张，界面和服务端均限制。旧备份允许读取原参数，恢复到生成表单时限制为 3 张；SVG 仍为 1 张。
- 添加「新建」：清除当前提示词、参数、参考图和结果，不删除历史。未保存图片仍受保护。
- 添加 GitHub 图标与「免费开源，请勿付费购买 · 欢迎赞赏」说明。
- 未消费的 Turnstile token 仅存当前标签页内存，最多保留 280 秒；读取不延长有效期，发起请求前消费，失败不复用。页面切换不再主动丢弃有效 token，服务端 Siteverify、hostname 和 action 校验保持不变。
- `pnpm verify` 通过，44 项测试覆盖数量边界、旧参数兼容、token 过期和单次消费。
- 本地浏览器验证 Base UI 质量菜单、数量 1/2/3、赞赏往返后可直接生成、选择历史后新建恢复空工作台。手机视口 390×844 下 content width 与 client width 均为 375px，没有横向溢出。
- 统一使用 `pnpm run deploy`，避免与 pnpm 自带的 `deploy` 命令冲突；已执行完整构建与生产部署成功。
- 生产浏览器同样完成赞赏页往返，没有重新挂载验证框；使用保留的真实 token 成功生成一张 low / 1024×1024 / PNG 图片，证明服务端验证仍然生效。历史选择后「新建」恢复空白提示词、默认参数与空画布。


## 移除人机验证与地区错误诊断

2026-11-06 后续部署，Worker 版本 `5d478287-cd48-4d8c-b413-2ddfb2f9e75e`：

- 按站点维护者要求移除 Turnstile 前端组件、token 生命周期和服务端校验；配置不再依赖 Turnstile bindings。旧标签页提交的 token 被忽略，不发送给上游。
- 保留同源检查、参数与文件校验、单次最多 3 张和请求 ID 去重。
- 上游失败只记录白名单错误码、状态、请求 ID、Worker 节点、模型和格式；不记录 API key、提示词、原始错误正文或访客 IP。自定义日志全采样，调用日志关闭。
- `pnpm verify` 通过：79 项测试，包含无验证码的生产请求、旧 token 兼容、地区错误分类和脱敏回归；lint、格式、类型、构建均通过。
- 生产 Chrome 实测 2.6 Flare / 自动质量 / 1024×1024 / PNG / 流式输出成功，D1 请求 `f98c6dbc-60f4-4a97-b588-7a98c6df27d9` 为 complete。赞赏页往返后生成按钮可直接使用，无验证码。
- 另一个访问来源仍返回上游 `403 / unsupported_country_region_territory`，Worker 节点为 SEA。该地区限制尚未解决，不能以本次成功请求代表所有来源均恢复。
- 本地直连同 key / 同模型 / 同 PNG 流式参数成功，说明已观察到的拒绝并非该组参数不合法或 key 普遍失效。具体上游地区判定依据仍未确认，未修改网络路由或部署转发服务。


## Cloudflare 来源地区对照实验

同日对报错访问来源做了两组线上实验，之后撤除临时探针与区域放置配置，恢复 `774fbf6` 的应用代码及常规错误日志。

| 实验 | 接入节点 | OpenAI 域名 trace 的节点 / 来源国家 | 只读 API 对照 |
| --- | --- | --- | --- |
| 默认放置 | HKG | HKG / CN | 默认请求头 403；清空来源头 403 |
| 显式 `placement.region=aws:us-west-2` | HKG | SEA / CN | 默认请求头 403；清空来源头 403 |

- 默认放置请求 ID：`0d226e42-56c6-472f-9ab1-7c52d9d0578a`；区域放置请求 ID：`9b9997ab-8b37-4b96-89a4-88c91148e7a9`。
- 两次真实 PNG 生图均返回 `unsupported_country_region_territory`。清空请求头对照使用同一次 Worker 调用上下文中的 `GET /v1/models`，没有额外自动生成图片；该对照不是清空请求头后的真实生图测试。
- 清空项为 `CF-IPCountry`、`CF-Connecting-IP`、`X-Forwarded-For`、`X-Real-IP`，均使用空值，没有伪造国家或 IP。应用原本就只显式发送 Authorization 和生图所需的 Content-Type，没有转发访客原始请求头。
- `api.openai.com/cdn-cgi/trace` 和 `www.cloudflare.com/cdn-cgi/trace` 都返回 200，且两者的国家均为 CN；美国区域放置后的两个目标节点均为 SEA。这证明改变执行区域并未消除该请求的访客来源上下文。
- `request.cf.colo` 表示请求接入节点，并不独立证明 Worker 放置后的执行位置。前文日志中 `colo` 的值应按此理解。
- 诊断只保留状态、国家代码和节点代码，不记录 IP、API key、提示词、原始 trace 内容。曾有一轮探针因 Workers 不支持 `redirect: error` 而未执行，相关 unavailable 结果已排除；改为 manual，并经本地 Workers 运行时验证后才得到了本表有效结果。
- 排查边界：已证实清空上述请求头的只读请求和美国区域放置均未解除拒绝；没有确认任何能在现有 Workers → OpenAI 直连链路中关闭平台来源上下文的有效配置。地区限制尚未修复，未新增 VPS 服务，也未向 VPS 传入 API key。

依据：[Cloudflare 请求头与跨站子请求](https://developers.cloudflare.com/fundamentals/reference/http-headers/)、[Workers Placement](https://developers.cloudflare.com/workers/configuration/placement/)、[OpenAI 支持地区](https://help.openai.com/en/articles/5347006-openai-api-supported-countries-and-territories)。
# AI Gateway 与东京转发验收（2026-11-06）

最终生产版本：`291f6e08-02b3-4b86-b8f5-99d07e299534`。链路为浏览器 → Cloudflare Worker → 东京 VPS Nginx → OpenAI；网页、D1/R2 与本地历史未迁移。

## AI Gateway 实验结果

- 创建项目网关，启用鉴权和 BYOK-only，关闭日志、Logpush、缓存，最大尝试次数为 1；请求再次显式禁用日志、缓存、重试与 Unified Billing 回退。
- 通过原生接口完成 PNG 生成和 multipart 图片编辑，均 HTTP 200 且归档成功；请求分别为 `1262805a-ec39-49b6-a82e-0703a367c803`、`67f32535-c951-4c36-919b-03a2fc16768e`。
- 受影响浏览器请求 `5cd0a3de-b993-44bb-b27f-c3ba9d16fd42` 仍返回 403 `unsupported_country_region_territory`，日志明确 `transport=ai_gateway`、接入节点 HKG。因此未将本网关作为地区问题的解决方案。
- Gateway GIF 尝试在本机连接网站时超时，没有完成上游验证；不得把该本机网络错误归因于 Gateway 不支持 GIF。
- 生产已移除两个 Gateway ID 变量，仅保留可选接入代码；测试网关和 Run-only token 未删除，不在当前调用链路中。网关日志、缓存和计费回退保持关闭。

## 东京转发结果

- 东京 VPS 用同一 key 直接调用图片 API，HTTP 200，1 张 PNG，12.4 秒。key 通过 SSH stdin 临时传入，未保存到 VPS。
- 使用独立 Nginx vhost `image-origin.cansiny.top:8443`，DNS-only，独立 Let's Encrypt 证书。共享鉴权 token 在 Worker Secret 和 root-only（0600）Nginx snippet；OpenAI key 只随 HTTPS 请求传递。
- Nginx 仅转发两个图片 POST 路径，关闭所有原始请求头透传，仅设置 Authorization、Content-Type、Host 与 Connection；验证上游 TLS；禁止重试、缓存和缓冲。未改变现有 VPS 应用路由。
- 无 token / 错误 token：403；非 POST：405；非白名单路径：404；合法 relay token 但缺 OpenAI key：上游 401，证明鉴权边界与转发生效。
- `nginx -t` 和平滑 reload 成功，Nginx active。现有 Certbot renew timer 会处理新证书；增加仅对该证书生效的 Nginx reload hook，并手动执行通过。证书本次有效期至 2027-02-04。

| 线上真实请求 | 请求 ID | 结果 |
| --- | --- | --- |
| PNG，2.6 Flare，自动质量，stream=true | `7221987d-0d49-4bc2-b075-619f590a51f0` | HTTP 200，1024×1024，758,787 bytes，8.6 秒，归档成功 |
| GIF，9 帧参数，200 ms，非流式 | `da843312-e9d9-4527-b9a3-7255313fd107` | HTTP 200，GIF 文件签名正确，512×512，110,533 bytes，12.8 秒，归档成功；未独立核验返回文件帧数 |
| multipart 图片编辑，stream=true | `abd98680-4efc-4389-b9e6-4bdfe8fef315` | HTTP 200，1024×1024 PNG，805,257 bytes，14.7 秒，归档成功 |

流式实测均收到了最终图片和 done；这些简单提示词未产生可单独观察的中间预览，不把它表述为已观察到 partial_image。分片与预览事件仍由单元测试覆盖。

**用户在此前持续报错的同一浏览器重试后明确反馈“已成功生成”。** 该反馈与以上实测共同作为本次地区故障恢复的验收。

完整 `pnpm verify` 通过：lint、格式、TypeScript、93 个测试、生产构建；前端产物检查未包含 OpenAI key、Gateway token 或 relay token。生产配置读回只有 relay origin 和对应 Secret，没有启用 Gateway ID。
