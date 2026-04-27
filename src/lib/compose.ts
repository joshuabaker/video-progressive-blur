import type { VideoSample } from 'mediabunny';
import { blurForLayer, dominantColorFromRgba, lerpColor, type RGB } from './color';

export type { RGB } from './color';

export type ComposeOptions = {
  bottomPercent: number;
  maxBlurPx: number;
  gradientOpacity: number;
  blurLayers: number;
  colorMode: 'static' | 'batched' | 'per-frame';
  colorBatchFrames: number;
};

export const DEFAULT_OPTIONS: ComposeOptions = {
  bottomPercent: 33,
  maxBlurPx: 12,
  gradientOpacity: 0.6,
  blurLayers: 6,
  colorMode: 'batched',
  colorBatchFrames: 12,
};

const SAMPLE_SIZE = 24;

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

  const sampleDominantColor = (source: OffscreenCanvas): RGB => {
    const bottomStart = Math.floor(height * (1 - opts.bottomPercent / 100));
    const bottomHeight = height - bottomStart;
    sampleCtx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    sampleCtx.drawImage(
      source,
      0,
      bottomStart,
      width,
      bottomHeight,
      0,
      0,
      SAMPLE_SIZE,
      SAMPLE_SIZE,
    );
    const data = sampleCtx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    return dominantColorFromRgba(data);
  };

  const updateColor = (): RGB => {
    if (opts.colorMode === 'static') {
      if (!staticColorComputed) {
        cachedColor = sampleDominantColor(main);
        staticColorComputed = true;
      }
      return cachedColor;
    }
    if (opts.colorMode === 'per-frame') {
      cachedColor = sampleDominantColor(main);
      return cachedColor;
    }
    const batch = Math.max(1, opts.colorBatchFrames);
    const idxInBatch = frameIndex % batch;
    if (idxInBatch === 0) {
      prevColor = nextColor;
      nextColor = sampleDominantColor(main);
      if (frameIndex === 0) prevColor = nextColor;
    }
    const t = idxInBatch / batch;
    cachedColor = lerpColor(prevColor, nextColor, t);
    return cachedColor;
  };

  const drawGradient = (color: RGB, bottomStart: number) => {
    const grad = mainCtx.createLinearGradient(0, bottomStart, 0, height);
    grad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
    grad.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, ${opts.gradientOpacity})`);
    mainCtx.fillStyle = grad;
    mainCtx.fillRect(0, bottomStart, width, height - bottomStart);
  };

  const applyProgressiveBlur = (bottomStart: number) => {
    if (opts.maxBlurPx <= 0) return;
    const layers = Math.max(1, Math.floor(opts.blurLayers));
    const regionHeight = height - bottomStart;

    for (let i = 0; i < layers; i++) {
      const blurPx = blurForLayer(i, layers, opts.maxBlurPx);
      if (blurPx < 0.1) continue;

      const layerStart = bottomStart + (regionHeight * i) / layers;
      const featherStart = bottomStart + (regionHeight * Math.max(0, i - 0.5)) / layers;
      const layerEnd = height;

      ctxB.save();
      ctxB.clearRect(0, 0, width, height);
      ctxB.filter = `blur(${blurPx.toFixed(2)}px)`;
      ctxB.drawImage(main, 0, 0);
      ctxB.restore();

      ctxA.save();
      ctxA.clearRect(0, 0, width, height);
      ctxA.drawImage(scratchB, 0, 0);
      ctxA.globalCompositeOperation = 'destination-in';
      const mask = ctxA.createLinearGradient(0, featherStart, 0, layerStart);
      mask.addColorStop(0, 'rgba(0,0,0,0)');
      mask.addColorStop(1, 'rgba(0,0,0,1)');
      ctxA.fillStyle = mask;
      ctxA.fillRect(0, featherStart, width, layerEnd - featherStart);
      ctxA.restore();

      mainCtx.drawImage(scratchA, 0, 0);
    }
  };

  return {
    canvas: main,
    compose(sample: VideoSample): OffscreenCanvas {
      mainCtx.clearRect(0, 0, width, height);
      sample.draw(mainCtx, 0, 0);

      const color = updateColor();
      const bottomStart = Math.floor(height * (1 - opts.bottomPercent / 100));
      drawGradient(color, bottomStart);
      applyProgressiveBlur(bottomStart);

      frameIndex++;
      return main;
    },
    composeFromImage(source: CanvasImageSource): OffscreenCanvas {
      mainCtx.clearRect(0, 0, width, height);
      mainCtx.drawImage(source, 0, 0, width, height);
      const color = updateColor();
      const bottomStart = Math.floor(height * (1 - opts.bottomPercent / 100));
      drawGradient(color, bottomStart);
      applyProgressiveBlur(bottomStart);
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
