# AI Gateway integration: approved design and implementation plan

Approved by the owner on 2026-11-06: first verify AI Gateway; if it cannot resolve the upstream region failure, move the generation service to the existing Japan VPS. Existing deployment and push authorization applies.

## Contract

- Browser → existing Worker → authenticated Cloudflare AI Gateway → OpenAI provider-native Images API. Preserve generation JSON, edit multipart, all model parameters and streaming bodies.
- Keep the OpenAI key in Worker secrets. Add a dedicated account-scoped AI Gateway Run token as a Worker secret; no credentials in the browser, tracked files or logs.
- Disable gateway log collection, Logpush, caching and retries. Require customer provider credentials and explicitly prohibit Unified Billing fallback. Keep the application's 240-second overall timeout.
- Preserve anonymous access without CAPTCHA, input/origin validation, request deduplication, maximum three images, D1/R2 archive and browser-local history.
- Gateway configuration is server-controlled. Absence of configuration retains the original direct path for self-hosting and rollback; incomplete configuration fails closed before reserving or generating.
- Do not infer a resolution from a non-CN test alone. Acceptance requires the previously failing user's route to succeed. No automatic retry through another backend.

## Steps and validation

1. Add routing regression tests in `apps/web/src/server/api.test.ts` for JSON, multipart, GIF fields, SSE pass-through, missing gateway credentials, and no secret leakage or automatic retries. Run focused tests and observe failure before implementation.
2. Update `apps/web/src/server/{api,openai}.ts`, server environment typing, `apps/web/wrangler.jsonc` and `.dev.vars.example`. Configure only the fixed Cloudflare native endpoint, not arbitrary client URLs.
3. Create the project gateway with authentication, BYOK-only, logging off, cache TTL zero and one attempt. Provision a dedicated Run-only token directly to the existing Worker secret without printing it. Read back non-secret configuration.
4. Run `pnpm verify` (checks plus generated production build), inspect client assets for credentials, deploy and read back deployment settings. These commands write build products; live tests call the provider and may incur image charges.
5. Run small live PNG streaming, GIF and multipart edit smoke tests. Record status, format, image count and archival state only. Request one same-browser CN verification after the own-route tests pass, using existing sanitized upstream logs for failures.
6. Update `docs/hosting.md`, `docs/hosting.en.md` and `docs/deployment-verification.md`; commit/push this authorized change after checks. Distinguish deployment success from end-to-end regional acceptance.

## Risks, fallback and rollback

Historical AI Gateway success does not prove current native Images API compatibility or resolution of country attribution. Gateway may introduce an extra failure/timeout boundary; real streaming and multipart tests are required. No fallback billing, cache, payload logs or retry is allowed.

Rollback clears the gateway configuration and redeploys the prior direct path. Remove the project-specific Gateway token only after no production deployment uses it. Preserve existing keys and stored images. If regional rejection persists, use the approved Japan VPS generation-service fallback while keeping frontend and archives on Cloudflare; inspect existing services before provisioning, preserve request validation and authenticated server-to-server access, and validate generation from the user's route before declaring recovery.

## Approved fallback execution

The affected browser's Gateway request `5cd0a3de-b993-44bb-b27f-c3ba9d16fd42` still returned 403 `unsupported_country_region_territory`. A direct PNG generation from the existing Tokyo VPS succeeded (HTTP 200, one image, 12.4 s). Execute the fallback already authorized by the owner.

- Reuse the VPS's existing Nginx with an isolated `image-origin.cansiny.top:8443` virtual host and its own HTTPS certificate. Do not modify existing service routes or install another application runtime.
- Only POST `/v1/images/generations` and `/v1/images/edits` can reach OpenAI. Require a randomly generated shared relay token stored in a root-only Nginx snippet and Worker Secret. The OpenAI key remains in the Worker and is sent over verified HTTPS for each call; it is not stored on the VPS.
- Disable forwarded request headers, then explicitly set only Host, Authorization and Content-Type. Preserve request bytes, multipart boundaries, response status and streaming bodies. Verify upstream TLS, disable buffering/retries/access logging, and cap uploads at the existing 40 MiB boundary.
- Add relay environment options and tests to the existing transport helper, retaining optional Gateway/direct configurations for self-hosting. Reject ambiguous Gateway-plus-relay or incomplete relay configuration. Log only the transport name and existing sanitized errors.
- Verify Nginx syntax before graceful reload; test missing/wrong relay tokens and unrecognized routes without sending OpenAI requests. Run PNG/GIF/edit through the production Worker and confirm D1 completion. Ask the affected browser for final acceptance only after own-route tests pass.
- Rollback: clear relay variables and redeploy, then disable only the new Nginx vhost and reload. Do not delete archives or change existing VPS services. DNS and certificates are project-specific additions.
