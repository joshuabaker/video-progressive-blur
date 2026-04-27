# CLAUDE.md

Notes for Claude (and any agent) working in this repo.

## What this project is

A browser-only tool that bakes a progressive blur and a tinted gradient into one edge of an MP4 (bottom by default; top / left / right also). Designed for thumbnail videos on Joshua's personal site where text needs to stay legible over the affected edge. Output preserves the original codec, dimensions, frame rate, and bitrate as closely as possible. Audio passes through untouched.

The pipeline runs entirely client-side via WebCodecs and [Mediabunny](https://mediabunny.dev). No server.

## Key files

| File | Role |
| --- | --- |
| `src/lib/compose.ts` | Per-frame compositor. Computes a `Region` from `edge` + `coveragePercent`, samples the dominant colour from it, draws the gradient, then applies the multi-layer canvas blur with mask gradients. Stateful per render. |
| `src/lib/color.ts` | Pure colour/blur helpers (lerp, weighted dominant colour, blur curve, hex ↔ rgb). Tested in `color.test.ts`. **Add new pure helpers here** so they're testable in Node. |
| `src/lib/render.ts` | Mediabunny pipeline: `Input` → `Conversion` (with `video.process` callback) → `Mp4OutputFormat` → `BufferTarget` → Blob. Mirrors source codec when `canEncodeVideo` says yes, falls back to AVC. Auto-registers the AAC encoder polyfill on Safari. |
| `src/lib/preview.ts` | rAF-driven live preview that wraps the same compositor. |
| `src/components/Dropzone.tsx`, `Controls.tsx`, `VideoControls.tsx` | UI controls. |
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
- **Pure helpers go in `lib/color.ts`** so they can be tested without a browser. Anything that touches `OffscreenCanvas`, `VideoSample`, etc. stays in `compose.ts` / `render.ts`.
- **The compose pipeline is**: video → tinted gradient → progressive blur. Blur curve is `pow(t, 1.5)` — top of the affected region barely blurs, the outer edge hits `maxBlurPx`. If you change this, update both `blurForLayer` (in `color.ts`) and the test that pins it.
- **Anything edge-specific** goes through the `Region` returned by `getRegion(edge, coveragePercent, w, h)`. Don't hardcode bottom-only assumptions.
- **Don't add backwards-compatibility shims**. If you change an option, change all call sites. (The one migration we kept — `bottomPercent` → `coveragePercent` in `loadOptions` — is fine to remove if you ever do another refactor.)
- **Vite base path** comes from `process.env.GITHUB_PAGES` or `VITE_BASE`. Don't hardcode it elsewhere — use `import.meta.env.BASE_URL` for runtime asset paths.

## Deploy

`.github/workflows/deploy.yml` deploys on push to `main`. The repository must have **Settings → Pages → Source = GitHub Actions** (one-time manual step). The deployed URL is `https://<owner>.github.io/video-progressive-blur/`.

For a custom domain, add `public/CNAME` and set `VITE_BASE=/` in the workflow env.

## Browser support

WebCodecs `VideoEncoder` + `VideoDecoder` required. The app warns the user if the API is missing. Targets: Chrome / Edge, Safari 16.4+, Firefox 130+. The AAC encoder polyfill (`@mediabunny/aac-encoder`) auto-registers when native AAC encoding isn't available (mainly Safari).

## Testing strategy

- **Unit tests** (`vitest`) cover the pure helpers in `color.ts`. Run with `npm run test`.
- **End-to-end testing is manual**: load the deployed page, click "Load sample clip", render, verify the output downloads and plays.
- The compositor itself (canvas drawing) is hard to unit-test without a real browser — visual regressions should be checked manually with the deployed sample.

## Things to avoid

- **Don't introduce ffmpeg.wasm** for the main render path. We rely on hardware-accelerated WebCodecs via Mediabunny. ffmpeg.wasm is ~30 MB, CPU-only, and ~8x slower at 1080p.
- **Don't bundle the sample MP4 in git.** It lives at `public/sample.mp4` only after `npm run fetch:sample` (or in CI via the deploy workflow); the path is git-ignored.
- **Don't `console.log` from the compositor.** It runs once per frame.

## Canvas blur cap workaround

`ctx.filter = 'blur(Npx)'` clamps internally around 200–300 px. For radii > 32 px the compositor downsamples the source by `floor(blurPx / 8)`, applies a small filter blur, and bilinearly upsamples — bypassing the kernel cap. If you change this threshold, recheck the visual feel at the slider's max (currently 128 px).
