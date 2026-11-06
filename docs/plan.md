# Implementation plan

## 1. Workspace and configuration
Files: package.json, pnpm-workspace.yaml, apps/web/{package.json,vite.config.ts,wrangler.jsonc,tsconfig.json,components.json}, .gitignore, .dev.vars.example.
Initialize the new directory and local Git identity, create the authorized public GitHub repository, add origin without committing or pushing. Install current compatible dependencies and lock versions. Configure local D1/R2 only. Confirm secrets ignored before local provisioning.
Validation: package-manager install and Wrangler generated binding types; no deployment commands.

## 2. Contracts and generation service
Files: apps/web/src/lib/{models,contract}.ts, apps/web/src/server/{api,openai,archive,security}.ts, apps/web/drizzle/*.
Write regression tests first for model/format constraints, oversized inputs, origin/Turnstile rejection, upstream errors, stream boundaries, completed-only archival, and archive failure preserving output. Implement with bounded parsing, no automatic generation retries, secret-safe errors, local D1/R2 bindings, and oRPC for typed configuration. Binary/stream generation route remains HTTP.
Validation: pnpm test, pnpm typecheck; local migrations write only local simulation data.

## 3. Local history and workbench UI
Files: apps/web/src/{routes,components,lib/history.ts,lib/store.ts,styles.css}.
Implement model-dependent common/advanced controls, upload/edit workflow, preview, downloads, stream updates, history drawer, export/import, local deletion, retryable local save failures. Keep full prompt and final Blobs locally; do not expose archives.
Validation: tests of binary export/import and save failures; browser checks desktop/mobile, history reload and requests, invalid inputs, loading/errors, keyboard accessibility.

## 4. Verification and handoff
Files: README.md, docs/verification.md, .github/workflows/check.yml.
Run pnpm verify (non-fixing lint, formatting, typecheck, tests, build), local runtime checks with mocked OpenAI, inspect bundle for secrets, attempt real API smoke using a minimal fixture. CI contains no deployment. Record measured results separately from estimates. Leave source uncommitted, do not push/deploy.

## Risks and rollback
OpenAI docs have preview/schema inconsistencies; gate unverified special capabilities and document exact supported combinations. New package APIs are checked against installed types and official docs. API account access or organization verification may block live validation. Browser storage capacity errors preserve results in memory for download. Local rollback removes only this task's new project; no existing projects are changed. Remote repository removal or Cloudflare setup requires separate authorization.
