export type RGB = { r: number; g: number; b: number };

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const lerpColor = (a: RGB, b: RGB, t: number): RGB => ({
  r: Math.round(lerp(a.r, b.r, t)),
  g: Math.round(lerp(a.g, b.g, t)),
  b: Math.round(lerp(a.b, b.b, t)),
});

// Saturation-weighted average of an RGBA pixel buffer. Less saturated pixels
// contribute less so a colourful subject overrides a wash of neutral background.
export function dominantColorFromRgba(data: Uint8ClampedArray | Uint8Array): RGB {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let weightSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const weight = 0.35 + sat * 0.65;
    rSum += r * weight;
    gSum += g * weight;
    bSum += b * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return { r: 0, g: 0, b: 0 };
  return {
    r: Math.round(rSum / weightSum),
    g: Math.round(gSum / weightSum),
    b: Math.round(bSum / weightSum),
  };
}

// Returns the px blur value for the i-th of N stacked layers, given a max.
// pow(t, 1.5) keeps the top of the region barely-blurred and ramps up.
export function blurForLayer(i: number, layerCount: number, maxBlurPx: number): number {
  const layers = Math.max(1, Math.floor(layerCount));
  const t = (i + 1) / layers;
  return maxBlurPx * Math.pow(t, 1.5);
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function rgbToHex(rgb: RGB): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(rgb.r)}${c(rgb.g)}${c(rgb.b)}`.toUpperCase();
}
