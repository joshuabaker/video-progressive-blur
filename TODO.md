# Video Progressive Blur — TODO

A browser app that bakes a progressive blur + tinted gradient into the bottom of an MP4, preserving the original codec, dimensions, frame rate, and bitrate. Designed for generating thumbnail videos for a personal site where text needs to stay legible over the bottom edge.

## Architecture decision

**Stack: Vite + React + TypeScript + [Mediabunny](https://mediabunny.dev) + (optional) `@mediabunny/aac-encoder` polyfill.**

Why not Remotion? Remotion shines for compositing animations from React components. For "decode an existing video, modify each frame, re-encode with the same parameters" Mediabunny is the better fit — its `Conversion` API has a `video.process(sample) => CanvasImageSource` hook that does exactly this and pass-through-copies audio + container + bitrate by default. Less code, fewer moving parts, no Lambda or Node round-trip.

Why not React Progressive Blur directly? It uses CSS `backdrop-filter` which only exists in the DOM. We re-implement its multi-tier mask technique on `OffscreenCanvas` using `ctx.filter = 'blur(Npx)'`.

The pipeline (per frame):
```
VideoSample
   ↓ draw to OffscreenCanvas (full frame, unmodified)
   ↓ sample dominant colour from bottom region (every N frames, eased between)
   ↓ paint linear-gradient overlay (alpha 0 → 1, top → bottom of blur region) tinted with dominant colour
   ↓ progressive blur: 4–6 stacked layers, each blurring the composite below with mask gradient
   ↓ return canvas to Mediabunny → re-encoded with original codec/bitrate
```

## Phases

### Phase 1 — Scaffold
- [ ] `npm create vite@latest` → React + TS template
- [ ] Install `mediabunny`, `@mediabunny/aac-encoder` (Safari fallback), `clsx`
- [ ] Strip Vite boilerplate, add base layout
- [ ] `.gitignore`, `tsconfig.json` strict, `vite.config.ts` (no special config needed)

### Phase 2 — UI shell
- [ ] Dropzone component (drag + drop, click to pick) accepting `video/mp4` + `video/quicktime`
- [ ] Controls panel:
  - Slider: **bottom region %** (10–60, default 33)
  - Slider: **max blur strength px** (0–32, default 12)
  - Slider: **gradient opacity** (0–1, default 0.6) — keeps it "subtle" per spec
  - Select: **blur quality** (4 / 6 / 8 layers — more layers = better gradient = slower)
  - Toggle: **dominant colour mode** (per-frame / batched 12-frame ease / static-from-first-frame)
- [ ] Live preview `<video>` of the input + an overlay `<canvas>` showing the effect at the current scrub position (cheap real-time preview using DOM, not the full pipeline)
- [ ] "Render" button → kicks off Mediabunny `Conversion`
- [ ] Progress bar + cancel button
- [ ] Download link on completion (auto-named `<original>-blurred.mp4`)

### Phase 3 — Compositor (the interesting bit)

`src/lib/compose.ts` exposes `composeFrame(sample, ctx, opts)`:

1. **Draw the frame**: `sample.draw(ctx, 0, 0)`.
2. **Dominant colour**: every N frames (configurable) downscale the bottom region of the source canvas to e.g. 16×16 with `imageSmoothingEnabled = true`, average the pixels (weighted toward saturation so we don't end up with mud), store. For frames between samples, lerp toward the next colour. Cache so we don't recompute every frame.
3. **Gradient overlay**: paint a `createLinearGradient(0, top, 0, bottom)` from `rgba(r,g,b,0)` → `rgba(r,g,b,opacity)` over the bottom region. `globalCompositeOperation = 'source-over'`.
4. **Progressive blur (multi-tier)**: split the bottom region into N horizontal bands. For each band `i` (0 = top, N-1 = bottom):
   - Blur strength = `maxBlur * ((i + 1) / N) ^ 1.5` (gamma > 1 keeps the top of the region barely-blurred so the transition feels smooth).
   - Snapshot the composite below into a temp canvas, apply `ctx.filter = 'blur(Xpx)'` and `drawImage` back.
   - Each band is masked with a gradient alpha so adjacent bands feather into each other (this is the trick `react-progressive-blur` uses — three layers × mask gradient → looks like one continuous blur ramp).

   To minimise allocation: keep two reusable `OffscreenCanvas` buffers (`scratchA`, `scratchB`) at full frame size and ping-pong between them.

5. Return the main canvas. Mediabunny will re-encode it.

### Phase 4 — Encode pipeline

`src/lib/render.ts`:

```ts
const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
const videoTrack = await input.getPrimaryVideoTrack();
const stats = await videoTrack.computePacketStats(100); // for bitrate matching

const output = new Output({
  format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
  target: new BufferTarget(),
});

const ctx = new OffscreenCanvas(videoTrack.codedWidth, videoTrack.codedHeight).getContext('2d')!;
const compositor = createCompositor(opts);

const conversion = await Conversion.init({
  input,
  output,
  video: {
    bitrate: Math.round(stats.averageBitrate), // match source
    process: (sample) => compositor.compose(sample, ctx),
  },
  // audio: untouched → copied through
});

conversion.onProgress = setProgress;
await conversion.execute();
download(output.target.buffer, `${file.name.replace(/\.[^.]+$/, '')}-blurred.mp4`);
```

Notes:
- `process` forces transcode (per Mediabunny docs); we explicitly set `bitrate` from the source's measured average so quality stays close.
- Codec defaults to first-encodable from MP4's supported list; we let Mediabunny pick (typically AVC), matching the source most of the time.
- Audio track flows through with `'copy'` semantics automatically since we haven't set any `audio` options.

### Phase 5 — Polish
- [ ] Show input metadata (resolution, duration, codec, source bitrate, fps) below the dropzone
- [ ] Detect Safari AAC encoder support; auto-`registerAacEncoder()` if missing
- [ ] Estimate render time (frames × per-frame ms from a 5-frame warmup)
- [ ] Handle errors: file format unrecognised, codec undecodable, encoder unavailable
- [ ] Mobile layout (the user mentioned iPhone — they're driving the agent, not the app, but make the page at least viewable)
- [ ] Persist last-used slider values in `localStorage`

### Phase 6 — Stretch goals (only if time)
- [ ] Side-by-side before/after preview
- [ ] Custom blur curve (linear / ease-in / ease-in-out / cubic)
- [ ] Optional vignette
- [ ] Web Worker for the compositor (Mediabunny is happy with `OffscreenCanvas` from a worker; would unblock the UI thread)
- [ ] Batch mode: drop multiple files, render sequentially

## Open questions for the user (non-blocking)
- **Dominant colour direction**: pull from the bottom region (where the gradient sits) or the whole frame? Bottom region feels more correct for "match what's already there"; planning that as default.
- **Gradient default opacity**: starting at 0.6. Lower = subtler.
- **Blur curve**: starting with `pow(t, 1.5)` — feels natural without being too aggressive at the top.

## Known constraints
- WebCodecs availability: Chrome/Edge/Safari 16.4+/Firefox 130+. The page should warn if `'VideoEncoder' in window` is false.
- HEVC source files: decode works in Safari but not Chrome (until very recently). For MVP we assume H.264 source.
- Memory: `BufferTarget` keeps the whole MP4 in RAM. Fine for thumbnail-scale clips (a few seconds, < 50 MB). If we want to handle longer files, swap to `StreamTarget` writing to `showSaveFilePicker`'s `FileSystemWritableFileStream`.
