import type { ComposeOptions } from './compose';
import { createCompositor, type Compositor } from './compose';

export type PreviewController = {
  attach: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => void;
  detach: () => void;
  setOptions: (opts: ComposeOptions) => void;
  setEnabled: (enabled: boolean) => void;
};

export function createPreviewController(initialOpts: ComposeOptions): PreviewController {
  let video: HTMLVideoElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let compositor: Compositor | null = null;
  let opts = initialOpts;
  let raf = 0;
  let lastSize = { w: 0, h: 0 };
  let enabled = true;

  const ensureCompositor = () => {
    if (!video || !canvas) return null;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    if (lastSize.w !== w || lastSize.h !== h) {
      canvas.width = w;
      canvas.height = h;
      ctx = canvas.getContext('2d');
      compositor = createCompositor(opts, w, h);
      lastSize = { w, h };
    }
    return compositor;
  };

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (!enabled || !video || !ctx) return;
    const c = ensureCompositor();
    if (!c) return;
    if (video.readyState < 2) return;
    const out = c.composeFromImage(video);
    ctx.clearRect(0, 0, canvas!.width, canvas!.height);
    ctx.drawImage(out, 0, 0);
  };

  return {
    attach(v, cv) {
      video = v;
      canvas = cv;
      ctx = cv.getContext('2d');
      lastSize = { w: 0, h: 0 };
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    },
    detach() {
      cancelAnimationFrame(raf);
      video = null;
      canvas = null;
      ctx = null;
      compositor = null;
    },
    setOptions(next) {
      opts = next;
      if (compositor && lastSize.w && lastSize.h) {
        compositor = createCompositor(opts, lastSize.w, lastSize.h);
      }
    },
    setEnabled(e) {
      enabled = e;
    },
  };
}
