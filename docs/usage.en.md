# Usage and data storage

[Back to README](../README.en.md) · [简体中文](usage.md)

Enter a prompt and select generation settings in the [studio](https://image.cansiny.top). Image editing accepts reference images and a mask or markup PNG. Download the result or continue editing it. Images, prompts, and settings shown in history come from the current browser.

The API key stays on the server. Image requests go through a Worker with server-side Turnstile verification. Available models and capabilities depend on the site's API project access.

## Storage and limits

- Generate up to three images per request. SVG remains limited to one image.
- Browser IndexedDB stores full prompts, generation settings, final image Blobs, and timestamps. Deleting local history does not delete server archives. Clearing browser data cannot be undone by restoring from the server. ZIP backups can transfer history; export includes loaded records by default, or a selected subset.
- D1 stores prompts, request status, and necessary image metadata. R2 stores original final image bytes. Neither provides visitor-facing history or image retrieval endpoints.
- References, masks, and markup are processed only for the current request. Intermediate previews are not stored. Logs do not include prompts, image content, or API keys.
- Editing supports up to 16 reference images. To stay within Worker memory constraints, the app limits each file to 10 MB and the total request to 24 MB; the UI uses 23 MB to leave room for overhead. Each image response event is limited to 20 MiB. These application limits are not the full OpenAI upload limits.
- Backups support up to 256 MB of image data. Export larger histories in batches. Browsers may evict site data, so download important images or export a backup.
- GIF is available for GPT Image 2.6 Flare / Sunburst, with frame count and frame duration controls and automatic dimensions by default. If a custom size fails, use automatic dimensions or fewer frames. Availability is subject to API project access. SVG still requires explicit server configuration. Neither format supports streaming previews. SVG supports only single-image text-to-image requests and is displayed through an `<img>`, never inserted as HTML. SVG and GIF results can be downloaded but cannot be used directly as raster references for another edit.
- If the connection drops, the upstream request may already have incurred usage. The app does not automatically regenerate. Final images already received can still be saved. Archive failures are reported without discarding generated images.
- If browser storage fails, an in-memory copy remains available for download or a save retry. Server archives have no automatic expiration.
