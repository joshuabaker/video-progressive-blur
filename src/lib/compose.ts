import type { VideoSample } from 'mediabunny';
import { blurForLayer, dominantColorFromRgba, lerpColor, type RGB } from './color';

export type { RGB } from './color';

export type Edge = 'top' | 'bottom' | 'left' | 'right';

export type ColorMode = 'static' | 'batched' | 'per-frame' | 'manual';

export type ComposeOptions = {
  edge: Edge;
  coveragePercent: number;
  maxBlurPx: number;
  gradientOpacity: number;
  blurLayers: number;
  colorMode: ColorMode;
  colorBatchFrames: number;
  manualColor: RGB;
};

export const DEFAULT_OPTIONS: ComposeOptions = {
  edge: 'bottom',
  coveragePercent: 33,
  maxBlurPx: 12,
  gradientOpacity: 0.6,
  blurLayers: 10,
  colorMode: 'per-frame',
  colorBatchFrames: 12,
  manualColor: { r: 0, g: 0, b: 0 },
};

const SAMPLE_SIZE = 24;

type Region = {
  x: number;
  y: number;
  w: number;
  h: number;
  axis: 'x' | 'y';
  inner: number; // axis coordinate at the un-affected side of the region (alpha 0)
  outer: number; // axis coordinate at the image boundary (alpha 1)
};

function getRegion(edge: Edge, percent: number, width: number, height: number): Region {
  const p = Math.max(0, Math.min(1, percent / 100));
  if (edge === 'bottom') {
    const inner = Math.floor(height * (1 - p));
    return { x: 0, y: inner, w: width, h: height - inner, axis: 'y', inner, outer: height };
  }
  if (edge === 'top') {
    const inner = Math.ceil(height * p);
    return { x: 0, y: 0, w: width, h: inner, axis: 'y', inner, outer: 0 };
  }
  if (edge === 'right') {
    const inner = Math.floor(width * (1 - p));
    return { x: inner, y: 0, w: width - inner, h: height, axis: 'x', inner, outer: width };
  }
  // left
  const inner = Math.ceil(width * p);
  return { x: 0, y: 0, w: inner, h: height, axis: 'x', inner, outer: 0 };
}

export function createCompositor(opts: ComposeOptions, width: number, height: number) {
  const main = new OffscreenCanvas(width, height);
  const scratchA = new OffscreenCanvas(width, height);
  const scratchB = new OffscreenCanvas(width, height);
  const mainCtx = main.getContext('2d')!;
  const ctxA = scratchA.getContext('2d')!;
  const ctxB = scratchB.getContext('2d')!;

  const sampleCanvas = new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })!;
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.imageSmoothingQuality = 'high';

  let frameIndex = 0;
  let cachedColor: RGB = { r: 0, g: 0, b: 0 };
  let prevColor: RGB = { r: 0, g: 0, b: 0 };
  let nextColor: RGB = { r: 0, g: 0, b: 0 };
  let staticColorComputed = false;

  const sampleDominantColor = (source: OffscreenCanvas, region: Region): RGB => {
    if (region.w <= 0 || region.h <= 0) return { r: 0, g: 0, b: 0 };
    sampleCtx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    sampleCtx.drawImage(
      source,
      region.x,
      region.y,
      region.w,
      region.h,
      0,
      0,
      SAMPLE_SIZE,
      SAMPLE_SIZE,
    );
    const data = sampleCtx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    return dominantColorFromRgba(data);
  };

  const updateColor = (region: Region): RGB => {
    if (opts.colorMode === 'manual') {
      return opts.manualColor;
    }
    if (opts.colorMode === 'static') {
      if (!staticColorComputed) {
        cachedColor = sampleDominantColor(main, region);
        staticColorComputed = true;
      }
      return cachedColor;
    }
    if (opts.colorMode === 'per-frame') {
      cachedColor = sampleDominantColor(main, region);
      return cachedColor;
    }
    const batch = Math.max(1, opts.colorBatchFrames);
    const idxInBatch = frameIndex % batch;
    if (idxInBatch === 0) {
      prevColor = nextColor;
      nextColor = sampleDominantColor(main, region);
      if (frameIndex === 0) prevColor = nextColor;
    }
    const t = idxInBatch / batch;
    cachedColor = lerpColor(prevColor, nextColor, t);
    return cachedColor;
  };

  const drawGradient = (color: RGB, region: Region) => {
    if (region.w <= 0 || region.h <= 0) return;
    const grad =
      region.axis === 'y'
        ? mainCtx.createLinearGradient(0, region.inner, 0, region.outer)
        : mainCtx.createLinearGradient(region.inner, 0, region.outer, 0);
    grad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
    grad.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, ${opts.gradientOpacity})`);
    mainCtx.fillStyle = grad;
    mainCtx.fillRect(region.x, region.y, region.w, region.h);
  };

  const renderBlurredSnapshot = (blurPx: number) => {
    // Render a blurred copy of `main` into scratchB. Canvas2D's
    // `ctx.filter = 'blur(Npx)'` clamps internally somewhere ~200–300 px,
    // so for larger radii we downsample first, apply a small filter blur,
    // and bilinearly upscale — bypassing the kernel cap.
    ctxB.save();
    ctxB.clearRect(0, 0, width, height);
    ctxB.imageSmoothingEnabled = true;
    ctxB.imageSmoothingQuality = 'high';

    if (blurPx <= 32) {
      ctxB.filter = `blur(${blurPx.toFixed(2)}px)`;
      ctxB.drawImage(main, 0, 0);
    } else {
      const scale = Math.max(2, Math.round(blurPx / 8));
      const dsW = Math.max(2, Math.floor(width / scale));
      const dsH = Math.max(2, Math.floor(height / scale));

      ctxA.save();
      ctxA.clearRect(0, 0, width, height);
      ctxA.imageSmoothingEnabled = true;
      ctxA.imageSmoothingQuality = 'high';
      ctxA.drawImage(main, 0, 0, dsW, dsH);
      ctxA.restore();

      const cleanup = Math.min(blurPx / scale, 24);
      if (cleanup >= 0.5) ctxB.filter = `blur(${cleanup.toFixed(2)}px)`;
      ctxB.drawImage(scratchA, 0, 0, dsW, dsH, 0, 0, width, height);
    }
    ctxB.restore();
  };

  const applyProgressiveBlur = (region: Region) => {
    if (opts.maxBlurPx <= 0 || region.w <= 0 || region.h <= 0) return;
    const layers = Math.max(1, Math.floor(opts.blurLayers));
    const span = region.outer - region.inner; // signed axis length
    const dir = Math.sign(span) || 1;

    for (let i = 0; i < layers; i++) {
      const blurPx = blurForLayer(i, layers, opts.maxBlurPx);
      if (blurPx < 0.1) continue;

      const layerT = i / layers;
      const featherT = Math.max(0, (i - 0.5) / layers);
      const layerPos = region.inner + span * layerT;
      const featherPos = region.inner + span * featherT;

      renderBlurredSnapshot(blurPx);

      ctxA.save();
      ctxA.clearRect(0, 0, width, height);
      ctxA.drawImage(scratchB, 0, 0);
      ctxA.globalCompositeOperation = 'destination-in';
      const mask =
        region.axis === 'y'
          ? ctxA.createLinearGradient(0, featherPos, 0, layerPos)
          : ctxA.createLinearGradient(featherPos, 0, layerPos, 0);
      mask.addColorStop(0, 'rgba(0,0,0,0)');
      mask.addColorStop(1, 'rgba(0,0,0,1)');
      ctxA.fillStyle = mask;
      // Fill from featherPos through outer (full-strength side).
      if (region.axis === 'y') {
        const a = dir > 0 ? featherPos : region.outer;
        const b = dir > 0 ? region.outer : featherPos;
        ctxA.fillRect(0, a, width, b - a);
      } else {
        const a = dir > 0 ? featherPos : region.outer;
        const b = dir > 0 ? region.outer : featherPos;
        ctxA.fillRect(a, 0, b - a, height);
      }
      ctxA.restore();

      mainCtx.drawImage(scratchA, 0, 0);
    }
  };

  const renderEffects = () => {
    const region = getRegion(opts.edge, opts.coveragePercent, width, height);
    const color = updateColor(region);
    drawGradient(color, region);
    applyProgressiveBlur(region);
  };

  return {
    canvas: main,
    compose(sample: VideoSample): OffscreenCanvas {
      mainCtx.clearRect(0, 0, width, height);
      sample.draw(mainCtx, 0, 0);
      renderEffects();
      frameIndex++;
      return main;
    },
    composeFromImage(source: CanvasImageSource): OffscreenCanvas {
      mainCtx.clearRect(0, 0, width, height);
      mainCtx.drawImage(source, 0, 0, width, height);
      renderEffects();
      return main;
    },
    reset() {
      frameIndex = 0;
      staticColorComputed = false;
      prevColor = { r: 0, g: 0, b: 0 };
      nextColor = { r: 0, g: 0, b: 0 };
    },
  };
}

export type Compositor = ReturnType<typeof createCompositor>;
