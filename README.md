# Video Progressive Blur

A small browser app that bakes a progressive blur and a tinted gradient into the bottom of an MP4 — perfect for thumbnail videos where text needs to stay legible.

Drop a video in, tweak the controls, render, download. Everything runs locally in your browser via [Mediabunny](https://mediabunny.dev) and the [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API). Nothing is uploaded.

## Features

- **Drop‑zone input** for MP4 / MOV / M4V
- **Progressive blur** (configurable strength, layer count, region size) on the bottom of every frame
- **Tinted linear gradient** behind the blur, sampled from the dominant colour of the frame (per‑frame, batched + eased, or a single static sample)
- **Lossy passthrough where possible**: source codec, dimensions, frame rate, and average bitrate are mirrored on the output. Audio is copied through without re‑encoding.
- **Live preview** of the effect on the input video
- **Progress + cancel** during render
- Settings persisted in `localStorage`

## Run it

```bash
npm install
npm run dev
```

Then visit the printed URL.

## Architecture

```
File → Mediabunny Input
         ↓
       Conversion.init({ video.process: composeFrame })
         ↓ (per frame)
       VideoSample.draw → OffscreenCanvas
       sampleDominantColor (every N frames, eased)
       drawGradient (tinted, alpha 0 → opacity, top → bottom)
       progressive blur (N stacked layers with mask gradients, ctx.filter = blur(Xpx))
         ↓
       Mediabunny encodes back to MP4 with matched codec + bitrate
         ↓
       BufferTarget → Blob → download
```

Audio passes through Mediabunny's conversion untouched. The video codec is matched to the source when the browser can encode it (`canEncodeVideo`); otherwise it falls back to AVC.

### Why not Remotion + react-progressive-blur?

Remotion shines for compositing animations from React components. For "decode an existing video, modify each frame, re‑encode preserving everything," Mediabunny's `Conversion.process` callback is purpose‑built. As of early 2026 Remotion is itself migrating its parser/encoder internals onto Mediabunny.

`react-progressive-blur` uses CSS `backdrop-filter`, which only works in the DOM. The compositor here ports its multi‑tier mask technique to `OffscreenCanvas` so the result can be baked into the video.

## Project structure

```
src/
  App.tsx              # main UI shell + state
  App.css              # styling
  components/
    Dropzone.tsx       # drag-and-drop file input
    Controls.tsx       # sliders + selects
  lib/
    compose.ts         # the per-frame compositor (blur + gradient + colour sampler)
    preview.ts         # rAF-driven live preview that wraps the compositor
    render.ts          # Mediabunny pipeline (Input → Conversion → Output)
TODO.md                # phased roadmap and stretch goals
```

## Browser support

Needs `VideoEncoder` and `VideoDecoder`. That means recent Chrome/Edge, Safari 16.4+, or Firefox 130+. The page warns if WebCodecs isn't available.

For Safari (which lacks AAC encode in WebCodecs), the `@mediabunny/aac-encoder` package is registered automatically as a fallback before any conversion runs.

## Notes

- Output uses `BufferTarget`, so the whole MP4 is held in memory while encoding. Fine for the short thumbnail clips this is designed for. For larger files, swap to `StreamTarget` with `showSaveFilePicker`'s writable stream — see `TODO.md`.
- HEVC source files: decoding works in Safari but not in Chrome until very recently. Test in your target browser if your source isn't H.264.
