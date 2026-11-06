# Development and deployment

[Back to README](../README.en.md) · [简体中文](hosting.md)

## Local development

Install dependencies and copy `.dev.vars.example` as described in the README, then set `OPENAI_API_KEY`. Local configuration uses `APP_ENV=development`, `APP_ORIGIN=http://127.0.0.1:4327`, and official Turnstile test keys. Test keys are accepted only in development on localhost.

`pnpm db:local` applies local migrations; `pnpm dev` starts the development server. Local D1 / R2 data lives in `apps/web/.wrangler`. Real image generation still calls the OpenAI API and incurs API usage.

| Command                            | Purpose                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `pnpm test`                        | Parameter, security, streaming, archive failure, and local backup tests |
| `pnpm build`                       | Build and static page generation                                        |
| `pnpm verify`                      | Lint, formatting checks, type checking, tests, and build                |
| `pnpm --filter @studio/web types`  | Update types after changing Worker bindings                             |
| `pnpm --filter @studio/web format` | Format source files; modifies files                                     |

Run build before your first standalone typecheck or verification to generate TanStack route types.

## First deployment to your account

You need a Cloudflare account with Workers, D1, and R2 enabled, a domain managed in that account, and an OpenAI API key with access to image models.

1. Sign in with `pnpm --filter @studio/web exec wrangler login` and confirm the account with `wrangler whoami`.
2. Create a D1 database and an R2 bucket. From `apps/web`, run `pnpm exec wrangler d1 create studio-archive` and `pnpm exec wrangler r2 bucket create gpt-image-studio-archive`. You can choose different names.
3. Create a Managed Turnstile widget in the Cloudflare dashboard, allowing only your site's hostname. Keep the public site key and private secret key.
4. Update `apps/web/wrangler.jsonc` using the table below. Keep R2 private, with public development URLs and custom domains disabled.

| Configuration                 | Value                                                                       |
| ----------------------------- | --------------------------------------------------------------------------- |
| `account_id`                  | Your Cloudflare account ID                                                  |
| `name`                        | Your Worker name                                                            |
| `routes[].pattern`            | Your domain; keep `custom_domain: true`                                     |
| `d1_databases[]`              | Your database name and ID; keep `binding: DB` and `migrations_dir: drizzle` |
| `r2_buckets[]`                | Your bucket name; keep `binding: IMAGES`                                    |
| `vars.APP_ORIGIN`             | Your full HTTPS origin without a trailing slash, matching the domain        |
| `vars.APP_ENV`                | `production`                                                                |
| `vars.TURNSTILE_SITE_KEY`     | Your real Turnstile site key                                                |
| `vars.ENABLE_PREVIEW_FORMATS` | Keep `false` unless you have verified SVG / GIF access for your API project |

From `apps/web`, set secrets interactively. Do not put keys in command arguments, Git, or plain environment-variable configuration:

```bash
pnpm exec wrangler secret put OPENAI_API_KEY
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
```

If the Worker does not exist, follow Wrangler's prompt to create it with the configured name. Return to the repository root, apply migrations, and deploy. Replace `studio-archive` below if you chose a different database name:

```bash
pnpm --filter @studio/web exec wrangler d1 migrations apply studio-archive --remote
pnpm run deploy
```

`pnpm run deploy` builds first, then deploys using `dist/server/wrangler.json`, preserving existing Worker Secrets. Cloudflare configures DNS and the certificate for the Custom Domain. GitHub Actions runs checks only, with no automatic deployment.

`.dev.vars` and the generated `dist/server/.dev.vars` are local files. Do not upload the entire dist directory or publish these files as static assets.

## Updates and verification

After code changes, run `pnpm build` and `pnpm verify`. Apply any new remote migrations before `pnpm run deploy`. README and documentation changes alone do not require redeployment.

After deploying, use a browser to check HTTPS, real image generation, local history after reload, and `/sponsor`. Confirm successful D1 archival, private R2 access, and the presence of both secrets. The app does not impose daily image quotas or a fixed global concurrency cap; API and Cloudflare service limits still apply.

Production disables workers.dev and preview URLs. Missing required configuration, an origin mismatch, or failed Turnstile verification rejects image generation. Workers Static Assets serves static navigation and assets; `/api/*` runs through the Worker.

To roll back code, use Worker version rollback in the Cloudflare dashboard. This does not roll back the D1 schema, delete archives, or restore browser data. Check compatibility before rolling back a version that depends on schema changes.

See [usage notes](usage.en.md) for storage behavior and upload limits. [Local verification](verification.md) and [deployment verification](deployment-verification.md) are recorded in Chinese.
