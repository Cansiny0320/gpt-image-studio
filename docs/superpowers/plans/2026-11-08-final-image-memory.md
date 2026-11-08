# 最终图内存优化实施计划

依据 [已批准设计](../specs/2026-11-08-final-image-memory-design.md)。当前工作区已包含强制关闭预览的改动，保留其他本地改动。

1. 在 `apps/web/src/server/stream.ts` 及图片分块模块增量读取上游 JSON；选择经 Worker 构建验证的 tokenizer。验证字段顺序、转义与网络切分、大小限制、多图、无图、截断和无效输入。若替换依赖，更新 `apps/web/package.json` 和 `pnpm-lock.yaml`。
2. 在 `apps/web/src/server/openai.ts`、`archive.ts`、`api.ts` 依次复用分块，保持 D1/R2 和 NDJSON 行为。验证字节一致、上传失败时仍可下载、D1 写失败清理、背压和取消。浏览器在 `apps/web/src/components/studio.tsx` 与共享读行模块中线性接收响应，不改变页面布局。
3. 运行 `pnpm test`、`pnpm typecheck`、Web lint、格式检查和 `pnpm build`。使用已安装的本地 workerd，以相同 2160×3840 PNG 和并发编排比较关闭预览后的旧路径与新路径，记录内存峰值及完整交付结果。测试只访问本地模拟上游和本地 D1/R2。

主要风险是解析边界、R2 流长度和在部分响应已发送后发生取消。回滚时仅撤销本计划的解析、归档和输出改动，保留已关闭的预览设置；不涉及数据迁移。未经授权不提交、不推送、不部署。
