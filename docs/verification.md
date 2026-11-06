# 首次本地验证记录（部署前）

验证日期：2026-11-06。环境：Node.js 24.22.1、pnpm 10.28.0、Wrangler 4.158.0。本地 D1/R2，无线上部署或 Cloudflare 资源创建。

## 自动检查

`pnpm verify` 全部通过：lint、格式检查、TypeScript、4 个测试文件中的 38 项测试、生产构建。

测试覆盖：模型与参数组合、流式碎片与截断、只留存最终图片、留档失败保留可下载结果、无自动重试、来源与 Turnstile 校验、重复请求拦截、伪造图片上传、无用户档案读取接口，以及 IndexedDB / ZIP 二进制往返。

包安装存在 Vite peer version 警告：本项目的 `vite` 指向官方 Vite+ core（版本号 1.5.0），依赖的 peer 范围使用上游 Vite 版本号。当前类型检查、测试、本地开发与生产预览均已实际通过；升级时仍需复测。

## 真实调用与本地数据

- 用既有 API key 调用 models 列表成功，界面列出的模型均可见。
- Chrome 中完成一次 `gpt-image-2.6-flare` 文生图：1024×1024、low、PNG、流式。蓝色陶瓷杯成功生成。
- 使用这张本地图片继续编辑，成功将杯子改为绿色，保持背景和构图。
- D1 查询：2 个请求均为 complete，2 张最终图片、2 个提示词，总图片数据 2,635,601 bytes。参考图与中间预览没有额外存档。
- 浏览器刷新后，历史记录仍包含完整图片和提示词。
- ZIP 导出成功下载；检查备份包含 1 个完整提示词和 1,281,598 bytes 原始 PNG。在不同 origin 的生产预览中导入后，恢复图片、提示词、模型、质量及尺寸。

## 页面与生产预览

- 桌面工作台、生成期间禁用相关操作、历史 drawer、继续编辑、导出 / 导入均检查通过。
- 390×844 移动视口正常；页面 content width 与 client width 均为 375px，无横向溢出。
- `/sponsor` 可从导航进入；收款图与 heybox-daily 原图 SHA-256 相同。README 同时包含赞赏图片。
- 生产构建由 `vp preview` 本地运行。`/` 和 `/sponsor` 导航均返回 200，响应与构建生成的 `index.html` 完全一致；`/api/history` 返回 404。静态导航无需执行应用 Worker。
- 测试截图保存在本次会话 outputs 中，没有提交到仓库。

## 密钥与发布状态

- 扫描待公开源文件和最终 `dist/client`，既有 API key 命中数均为 0。
- `.dev.vars` 权限为 0600，Git 忽略；构建工具生成的 `dist/server/.dev.vars` 同样被忽略。不要上传整个 dist 目录或本地凭据文件。
- Git identity 仅在此仓库配置为 Cansiny / GitHub noreply 邮箱。公开 GitHub 仓库已创建，尚无 commit/push；没有部署。

## 尚未实测的范围

SVG / GIF 预览权限尚未验证，默认禁用。其他模型、全部尺寸 / 质量组合、真实 mask / markup、生产 Turnstile 域名和线上 Workers CPU / 内存尚未逐项实测。对应参数与错误处理有自动测试；不能把本地成功等同于线上额度或所有模型能力保证。
