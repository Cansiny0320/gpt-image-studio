<h1 align="center">GPT Image Studio</h1>
<p align="center">Generate and edit images with GPT Image, with streaming previews, local history, and deployment on Cloudflare.</p>
<p align="center">
  <a href="https://github.com/Cansiny0320/gpt-image-studio/actions/workflows/check.yml"><img src="https://github.com/Cansiny0320/gpt-image-studio/actions/workflows/check.yml/badge.svg" alt="Checks"></a>
</p>
<p align="center"><a href="README.md">简体中文</a> · English</p>
<p align="center">
  <a href="https://image.cansiny.top">Try it online</a> ·
  <a href="docs/hosting.en.md">Deployment</a> ·
  <a href="https://github.com/Cansiny0320/gpt-image-studio/issues">Report an issue</a> ·
  <a href="#support">Support</a>
</p>

## Try it online

Visit [image.cansiny.top](https://image.cansiny.top) and enter a prompt to generate an image. No account or personal API key is required.

Generate images from text, edit reference images, upload mask or markup PNGs, generate up to three images per request, and watch streaming previews. Available size, quality, background, output format, and advanced settings depend on the selected model.

Download a result or use it for another edit. History stays in your browser, including full prompts, settings, and images, with ZIP export and import.

## Run locally

You need Node.js 24.11+, pnpm 10, and an OpenAI API key with access to the image models you want to use.

```bash
git clone https://github.com/Cansiny0320/gpt-image-studio.git
cd gpt-image-studio
pnpm install --frozen-lockfile
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Set `OPENAI_API_KEY` in `apps/web/.dev.vars`, then start the app:

```bash
pnpm db:local
pnpm dev
```

Open [127.0.0.1:4327](http://127.0.0.1:4327). Local development uses emulated D1 / R2 and official Turnstile test keys; it does not write to production storage.

## Deploy your own instance

Deployment requires Cloudflare Workers, D1, a private R2 bucket, and Turnstile. Follow the [deployment guide](docs/hosting.en.md) to configure your resources, domain, and Worker Secrets, then run:

```bash
pnpm --filter @studio/web exec wrangler d1 migrations apply studio-archive --remote
pnpm run deploy
```

The resource configuration in this repository belongs to the hosted instance. Replace it before deploying to your account. GitHub Actions runs checks only; it does not deploy.

## Things to know

- The API key stays on the server. Image requests go through a Worker after server-side Turnstile verification.
- The server also keeps prompts and final images in a private archive. Visitors cannot read that archive or restore history from it. Deleting local history does not delete the server archive, which has no automatic expiration.
- Clearing browser data removes local history. Download important images or export a backup. Uploaded references, masks, markup, and intermediate previews are not archived.
- Model capabilities depend on your API project's access. SVG / GIF preview features are disabled by default. See [usage notes](docs/usage.en.md) for upload and other application limits.

## Development

Built with TypeScript, React 19, TanStack Start / Router, Tailwind CSS v4, Base UI / shadcn, Zustand, oRPC, Drizzle, and Cloudflare Workers / D1 / R2, using pnpm workspaces and Vite+.

Run `pnpm test` for tests, `pnpm build` to build, and `pnpm verify` for lint, formatting checks, type checking, tests, and a build. Run `pnpm build` once before your first verification to generate route types.

The interface takes inspiration from [GPT Image Playground](https://github.com/CookSleep/gpt_image_playground); the implementation is independently written. The [spec](docs/spec.md) and [plan](docs/plan.md) document the design and implementation in Chinese.

## Feedback

Open an [issue](https://github.com/Cansiny0320/gpt-image-studio/issues) with reproduction steps, your browser, the selected model, and the error message. Do not include API keys, private prompts, or images.

## Support

If you find this project useful, you can support it through WeChat Pay or Alipay. The same QR codes are available on the website's [support page](https://image.cansiny.top/sponsor).

![WeChat Pay and Alipay support QR codes](apps/web/public/sponsorship.png)
