# Video Progressive Blur

A browser app that bakes a progressive blur and tinted gradient into one edge of an MP4 — built for thumbnail videos where text needs to stay legible over the affected area.

Drop a video in, tweak the controls, render, download. Everything runs locally via [Mediabunny](https://mediabunny.dev) and the [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API).

## Features

- **Drop-zone input** for MP4 / MOV / M4V (or load a bundled Big Buck Bunny clip).
- **Progressive blur** on any edge (bottom / top / left / right), with configurable coverage, max radius, and layer count.
- **Tinted linear gradient** behind the blur, sampled from the dominant colour of the affected region. Modes: per frame (default), batched + eased, static, or manual hex.
- **Lossless passthrough where possible**: source codec, dimensions, frame rate, and average bitrate are mirrored on the output. Audio is copied through without re-encoding.
- Live preview of the effect, custom scrub controls, render progress + cancel, settings persisted in `localStorage`.

## Run it

```bash
npm install
npm run fetch:sample    # optional, pulls a 10s Big Buck Bunny clip into public/
npm run dev
```

Then visit the printed URL.

## Test

```bash
npm run test
```

Vitest unit tests cover the pure helpers in `src/lib/color.ts` (colour math, blur curve, hex ↔ rgb). The compositor and encode pipeline are checked manually against the deployed page.

## Deploy (GitHub Pages)

Push to `main` and `.github/workflows/deploy.yml` will install, fetch the sample clip, build with `GITHUB_PAGES=true` (so Vite emits `/video-progressive-blur/` as the base path), and deploy.

One-time setup: **Settings → Pages → Source = "GitHub Actions"**.

The deployed URL is `https://<owner>.github.io/video-progressive-blur/`. For a custom domain, drop a `public/CNAME` and set `VITE_BASE=/` in the workflow env.

## Architecture

```
File → Mediabunny Input
         ↓
       Conversion.init({ video.process: composeFrame })
         ↓ (per frame)
       VideoSample.draw → OffscreenCanvas
       sampleDominantColor (within the edge × coverage region)
       drawGradient (tinted, alpha 0 at the inner edge → opacity at the outer edge)
       progressive blur (N stacked layers with mask gradients)
         ↓
       Mediabunny re-encodes to MP4 with matched codec + bitrate
         ↓
       BufferTarget → Blob → download
```

Audio passes through Mediabunny's conversion untouched. The video codec is matched to the source when the browser can encode it (`canEncodeVideo`); otherwise it falls back to AVC.

For blur radii > 32 px the compositor downsamples the source, applies a small filter blur, and bilinearly upsamples — Canvas2D's `ctx.filter = 'blur()'` clamps internally around 200–300 px and the downsample sidesteps that cap.

### Why not Remotion + react-progressive-blur?

Remotion is great for compositing animations from React components. For "decode an existing video, modify each frame, re-encode preserving everything," Mediabunny's `Conversion.process` callback is purpose-built. Remotion is itself migrating its parser/encoder internals onto Mediabunny.

`react-progressive-blur` uses CSS `backdrop-filter`, which only works in the DOM. The compositor here ports its multi-tier mask technique to `OffscreenCanvas` so the result can be baked into the video.

## Project structure

```
src/
  App.tsx                # main UI shell + state
  App.css                # styling
  main.tsx               # React entry
  components/
    Dropzone.tsx         # drag-and-drop file input
    Controls.tsx         # sliders + selects + colour picker + reset
    VideoControls.tsx    # custom play/pause + scrub bar (rAF-driven)
  lib/
    compose.ts           # per-frame compositor (region + blur + gradient + colour sampler)
    color.ts             # pure helpers (tested)
    color.test.ts        # vitest suite
    preview.ts           # rAF-driven live preview that wraps the compositor
    render.ts            # Mediabunny pipeline
scripts/
  fetch-sample.mjs       # downloads sample.mp4 (build-time)
.github/workflows/
  deploy.yml             # build + deploy to GitHub Pages on push to main
```

## Browser support

Needs `VideoEncoder` and `VideoDecoder`. That means recent Chrome / Edge, Safari 16.4+, or Firefox 130+. The page warns if WebCodecs isn't available. On Safari (which lacks AAC encode in WebCodecs) the `@mediabunny/aac-encoder` package auto-registers as a fallback.

## Notes

- Output uses `BufferTarget`, so the whole MP4 is held in memory while encoding. Fine for short thumbnail clips. For larger files, swap to `StreamTarget` with `showSaveFilePicker`'s writable stream.
- HEVC source files: decoding works in Safari but not always in Chrome. Test in your target browser if your source isn't H.264.
