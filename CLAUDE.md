# CLAUDE.md

Notes for Claude (and any agent) working in this repo.

## What this project is

A browser-only tool that bakes a progressive blur and a tinted gradient into the bottom region of an MP4. Designed for thumbnail videos on Joshua's personal site where text needs to stay legible over the bottom edge. Output preserves the original codec, dimensions, frame rate, and bitrate as closely as possible. Audio passes through untouched.

The core pipeline runs entirely client-side via WebCodecs and [Mediabunny](https://mediabunny.dev). No server, no upload.

## Key files

| File | Role |
| --- | --- |
| `src/lib/compose.ts` | Per-frame compositor (gradient + multi-layer canvas blur with mask gradients + dominant-colour sampler). Stateful per render. |
| `src/lib/color.ts` | Pure colour/blur helpers. Tested in `color.test.ts`. **Add new pure helpers here** so they're testable in Node. |
| `src/lib/render.ts` | Mediabunny pipeline: `Input` → `Conversion` (with `video.process` callback) → `Mp4OutputFormat` → `BufferTarget` → Blob. Mirrors source codec when `canEncodeVideo` says yes, falls back to AVC. |
| `src/lib/preview.ts` | rAF-driven live preview that wraps the same compositor. |
| `src/components/Dropzone.tsx`, `Controls.tsx` | UI controls. |
| `src/App.tsx` | Glue: state, lifecycle, sample loader, render kickoff, download. |
| `scripts/fetch-sample.mjs` | Downloads a public-domain test clip into `public/sample.mp4` at build time. Idempotent. |
| `.github/workflows/deploy.yml` | Builds and deploys to GitHub Pages on push to `main`. Sets `GITHUB_PAGES=true` so Vite rewrites the base path. |

## Running

```bash
npm install
npm run fetch:sample   # optional — pulls a sample MP4 for local testing
npm run dev            # local dev (base = '/')
npm run build          # production build (base = '/' locally, '/video-progressive-blur/' on CI)
npm run test           # vitest unit tests for color.ts helpers
```

## Conventions

- **No new files unless required.** Prefer editing existing modules.
- **Pure helpers go in `lib/color.ts`** (or a similar pure module) so they can be tested without a browser. Anything that touches `OffscreenCanvas`, `VideoSample`, etc. stays in `compose.ts` / `render.ts`.
- **The compose pipeline is**: video → tinted gradient → progressive blur. Blur curve is `pow(t, 1.5)` so the top of the region barely blurs and the bottom hits `maxBlurPx`. If you change this, update both `blurForLayer` (in `color.ts`) and the test that pins it.
- **Don't add backwards-compatibility shims**. If you change an option, change all call sites.
- **Vite base path** comes from `process.env.GITHUB_PAGES` or `VITE_BASE`. Don't hardcode it elsewhere — use `import.meta.env.BASE_URL` for runtime asset paths.

## Deploy

`.github/workflows/deploy.yml` deploys on push to `main`. The repository must have **Settings → Pages → Source = GitHub Actions** (one-time manual step). The deployed URL is `https://<owner>.github.io/video-progressive-blur/`.

For a custom domain, add `public/CNAME` and set `VITE_BASE=/` in the workflow env.

## Browser support

WebCodecs `VideoEncoder` + `VideoDecoder` required. The app warns the user if the API is missing. Targets: Chrome / Edge, Safari 16.4+, Firefox 130+. The AAC encoder polyfill (`@mediabunny/aac-encoder`) auto-registers when native AAC encoding isn't available (mainly Safari).

## Testing strategy

- **Unit tests** (`vitest`) cover the pure helpers in `color.ts`. Run with `npm run test`.
- **End-to-end testing is manual for now**: load the deployed page, click "Load sample clip", render, and verify the output downloads and plays. A Playwright suite is on the TODO list once the page is live.
- The compositor itself (canvas drawing) is hard to unit-test without a real browser — visual regressions should be checked manually with the deployed sample.

## Things to avoid

- **Don't introduce ffmpeg.wasm** for the main render path. We rely on hardware-accelerated WebCodecs via Mediabunny (~5 kB lib + native codecs). ffmpeg.wasm is ~30 MB, CPU-only, and ~8x slower at 1080p. It's only worth considering as a fallback for browsers without WebCodecs encode, which we explicitly don't target.
- **Don't bundle the sample MP4 in git.** It's `.gitignore`d-by-omission (only present in `public/sample.mp4` after `npm run fetch:sample`) and re-fetched at deploy time.
- **Don't `console.log` from the compositor.** It runs once per frame.

## Open work

See `TODO.md` for the phased roadmap. Stretch items live in Phase 6.
