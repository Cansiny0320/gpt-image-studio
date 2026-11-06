# 上线验证

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
