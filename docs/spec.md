# GPT Image Studio

Approved 2026-11-06. Anonymous image generation and editing using the owner's server-side OpenAI API key. No login, daily image quota, fixed global concurrency cap, or retention expiry.

## Product and data contract
- TanStack Start/Router + React 19, TypeScript, Tailwind v4, shadcn/base-nova, Lucide, Zustand, oRPC; pnpm workspace and Vite+.
- Workers proxies the Images API. Turnstile is verified server-side, along with origin, request size, and model-specific parameter validation. No arbitrary upstream URLs or credentials from browsers.
- Cover applicable generation/edit parameters: model, prompt, size, quality, n, background, output format/compression, moderation, complexity, input fidelity, mask, markup, GIF fields, SVG author settings. New requests disable intermediate previews; legacy preview settings remain readable in backups. Gate experimental formats explicitly. No retired DALL-E parameters. Source image inputs use uploads, not arbitrary remote fetches.
- Browser IndexedDB stores the complete prompt, output image Blobs, parameters, timestamps, and local history. Export/import works without a server history endpoint. Reference uploads are not part of local history.
- D1 records prompts and selected generation settings at request reservation, including requests where generation fails, plus necessary status and association metadata. Private R2 records final binary images and the original reference files from newly accepted edit requests. The reference object prefix uses the D1 request ID, with files numbered in upload order. Reference archival begins after validation and request reservation and before the upstream call. Successfully stored references are retained even if generation fails. Server archives have no automatic expiration. There is no public bucket or image read endpoint. Local history deletion does not delete archives.
- Generation response returns the output directly. Archive errors are explicit but must not discard a valid generated image. Browser persistence errors preserve download access.
- Masks and markup are transient. A reference write failure does not block generation or discard successfully archived files. A successful generation with a reference write failure reports the existing archive warning and records `archive_failed`. No automatic retries of paid generation requests. Duplicate clicks are suppressed. Network uncertainty is reported explicitly.
- UI: prompt and controls on left, output preview on right; history drawer, mobile stacked layout. Advanced controls collapse. Download and send-to-edit are primary output actions. No promotional content or nested decorative cards.
- Follow-up: add /sponsor and a README donation section reusing the owner's existing Heybox Daily WeChat/Alipay artwork. No imported supporter list or extra service.

## Security and operational boundaries
- Secret key stays in ignored .dev.vars locally and Worker secrets in deployment. Never enters client bundle, API responses, source, docs, or logs.
- Turnstile production verification fails closed; local use of official test keys only under explicit development environment.
- No content logging. R2/D1 are local simulations for tests. Use bounded uploads and response parsing to protect Worker memory. SVG is displayed as an image, never inserted into DOM.
- Initial implementation excluded deployment. On 2026-11-06 the user explicitly authorized committing/pushing to GitHub and Cloudflare production deployment at image.cansiny.top, including the required project-specific resources and secrets.
- Browser data eviction is possible: export/import and explicit save failures are required. No automatic server recovery of history.

## Acceptance
- Generate, edit with references/mask/markup, batch outputs, supported format parameters, and final image delivery have validated contracts and meaningful regression tests.
- All user-visible history is local, works after reload and offline, and never requests archive reads.
- Key absent from frontend assets. Turnstile/origin/parameter rejection occurs before OpenAI calls. Errors do not leak provider details or credentials.
- Typecheck, lint/format check, unit/integration tests, production build, and local browser checks pass. A small live API smoke test is attempted with existing key; account or API limitations are reported without fake success.

## Sources
- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/reference/resources/images/methods/generate
- https://developers.openai.com/api/reference/resources/images/methods/edit
- https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
