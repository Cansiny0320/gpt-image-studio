# GPT Image 参数兼容性检查

检查日期：2026-11-06。范围为工作台已暴露的 Images API 设置、前后端校验、模型切换和请求序列化。

## 对照结果

| 设置         | 当前行为                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 模型         | 明确传入模型 ID；保留 2.6、2.5、2、1.5、1-mini 和 chatgpt-image-latest。最后一个已被官方标为 deprecated，不能视为最新模型别名。        |
| 提示词       | 必填，最多 32,000 字符。                                                                                                               |
| 数量         | API 接受 1–10；本站按产品要求限制 1–3，SVG 为 1。历史备份仍可读取旧批量参数。                                                          |
| 静态图尺寸   | 旧模型使用标准尺寸或 auto；2 系列支持自定义尺寸，校验 16 倍数、宽高比、像素数和最长边。                                                |
| GIF 尺寸     | 独立于静态图最小像素数；选择 GIF 默认 auto，自定义宽高为正数且是 16 的倍数。总帧像素预算和排布限制仍由上游验证，不能仅按单帧尺寸判断。 |
| 质量、复杂度 | xhigh / max 和 complexity 对 2.5、2.6 开放；切到旧模型会移除不兼容参数。complexity 未选时省略，使用模型默认。                          |
| 背景         | transparent 只与 PNG / WebP 组合；其他格式切换为 opaque，服务端也校验。                                                                |
| 输出格式     | PNG / JPEG / WebP；GIF 仅对 2.6 Flare / Sunburst 开放。SVG 仍由 ENABLE_PREVIEW_FORMATS 控制，默认关闭。                                |
| 压缩         | 仅 JPEG / WebP 支持 0–100；其他格式不发送。                                                                                            |
| 审核         | auto / low。                                                                                                                           |
| 流式预览     | partial_images 为 0–3；关闭 stream 时不向上游发送 partial_images。GIF / SVG 禁用流式输出。                                             |
| GIF 帧配置   | frame_count 为 2–16，默认 9；frame_duration_ms 默认 200。本站暂保留指南中的 20–2000 ms 范围。切换到其他格式后移除帧参数。              |
| 输入保真度   | 仅编辑模式：1.5 支持 low / high，1-mini 仅 low；2 系列省略。                                                                           |
| 参考图       | 编辑模式必须上传 1–16 张 PNG / JPEG / WebP；本站单文件 10 MiB、总请求 24 MiB 为运行环境限制。                                          |
| 遮罩与标注   | 不可同时使用；要求 PNG alpha 通道并与首张参考图同尺寸。GIF 禁止 mask；markup 仅 2.5 / 2.6。切换模式、模型或格式会清理隐藏的附件。      |
| SVG 作者设置 | 作者模型可选；reasoning 未指定时界面显示“模型默认”，请求中省略。具体作者模型可接受的 effort 由上游验证。                               |
| 请求边界     | 文生图发送 JSON；编辑发送 multipart/image[]。不发送 UI mode、API key、遗留 response_format/style/user 参数；安全标识由服务端生成。     |

## 修正与证据

- GIF 不再被 SVG 开关连带禁用，服务端拒绝非 2.6 的 GIF 请求。
- 修正 GIF 直接继承静态图尺寸的问题；恢复或切换模型时不会残留非法 GIF 尺寸、帧参数、遮罩或标注。
- 非流式请求省略 partial_images，SVG 作者推理默认显示与请求保持一致，透明背景限定 PNG / WebP。
- 真实 API：2.6 Flare、low、auto、9 帧、200 ms 成功返回 GIF89a，512×512，67,212 bytes；解析确认 9 个图像帧，每帧 200 ms，文件正常结束。
- 同次检查中，1024×1024、2 帧被 API 以 size 参数错误拒绝。这证明 GIF 不能复用静态图预设；不自动重试或静默替换用户明确指定的尺寸。
- 本地浏览器确认：2.6 格式列表有 GIF；选择后画幅为自动、出现帧配置且隐藏流式开关；切至 2.5 后恢复 PNG，格式列表无 GIF。
- 自动测试覆盖模型矩阵、格式切换、服务端拒绝、上传附件清理、请求序列化和 GIF 原始字节传递；常规 lint、格式、类型及构建检查同时运行。

## 文档差异与验证边界

官方指南与 API Reference 并非完全一致：GIF 时长指南为 20–2000 ms，Reference 只给最小值并说明编码上限 655,350 ms；SVG 编辑在 Reference 中列出，但指南明确不支持。当前采用较窄且已明确的行为，保留 SVG 文生图限制，不凭字段枚举开放功能。

模型介绍页的通用 Streaming 标记与 Images API 的 stream 字段说明也不完全一致；当前按 Images API 指南处理，不以通用标签判断图片端点能力。chatgpt-image-latest 虽 deprecated，仍列在 Images API 支持模型中，暂保留兼容。

本次真实 GIF 调用验证的是 Flare 的上述组合，不代表已逐项实测 Sunburst、全部质量、批量、尺寸、遮罩或标注组合。SVG 权限、作者模型权限、自定义 GIF 总像素预算和真实标注透明像素内容仍需要上游最终校验。API key 不进入浏览器或仓库。

## 官方依据

- [Images API — Generate](https://developers.openai.com/api/reference/resources/images/methods/generate)
- [Images API — Edit](https://developers.openai.com/api/reference/resources/images/methods/edit)
- [Image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
- [GPT Image 2.6 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare)
- [chatgpt-image-latest](https://developers.openai.com/api/docs/models/chatgpt-image-latest)
