import { describe, expect, it } from 'vitest';
import { blurForLayer, dominantColorFromRgba, hexToRgb, lerp, lerpColor, rgbToHex } from './color';

describe('lerp', () => {
  it('returns a at t=0 and b at t=1', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });
  it('is linear at midpoint', () => {
    expect(lerp(10, 30, 0.5)).toBe(20);
  });
});

describe('lerpColor', () => {
  it('rounds to integer channels', () => {
    const out = lerpColor({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5);
    expect(out).toEqual({ r: 128, g: 128, b: 128 });
  });
  it('preserves channel independence', () => {
    const out = lerpColor({ r: 100, g: 0, b: 200 }, { r: 200, g: 100, b: 0 }, 0.25);
    expect(out).toEqual({ r: 125, g: 25, b: 150 });
  });
});

describe('dominantColorFromRgba', () => {
  const fillRgba = (n: number, r: number, g: number, b: number) => {
    const arr = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      arr[i * 4 + 0] = r;
      arr[i * 4 + 1] = g;
      arr[i * 4 + 2] = b;
      arr[i * 4 + 3] = 255;
    }
    return arr;
  };

  it('returns the input colour for a uniform field', () => {
    const out = dominantColorFromRgba(fillRgba(64, 200, 50, 25));
    expect(out).toEqual({ r: 200, g: 50, b: 25 });
  });

  it('returns black for an empty buffer', () => {
    expect(dominantColorFromRgba(new Uint8ClampedArray(0))).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('weights saturated pixels higher than neutral ones', () => {
    // 50% mid-grey neutral pixels + 50% saturated red pixels — the result
    // should lean closer to red than a flat 50/50 average (128, 64, 64).
    const buf = new Uint8ClampedArray(8 * 4);
    for (let i = 0; i < 4; i++) {
      buf[i * 4 + 0] = 128; buf[i * 4 + 1] = 128; buf[i * 4 + 2] = 128; buf[i * 4 + 3] = 255;
    }
    for (let i = 4; i < 8; i++) {
      buf[i * 4 + 0] = 255; buf[i * 4 + 1] = 0; buf[i * 4 + 2] = 0; buf[i * 4 + 3] = 255;
    }
    const out = dominantColorFromRgba(buf);
    const flatAvg = { r: (128 + 255) / 2, g: 64, b: 64 };
    expect(out.r).toBeGreaterThan(flatAvg.r);
    expect(out.g).toBeLessThan(flatAvg.g);
  });
});

describe('hexToRgb', () => {
  it('parses a 6-digit hex with hash', () => {
    expect(hexToRgb('#ff8800')).toEqual({ r: 255, g: 136, b: 0 });
  });
  it('parses without leading hash', () => {
    expect(hexToRgb('00aaff')).toEqual({ r: 0, g: 170, b: 255 });
  });
  it('returns black for invalid input', () => {
    expect(hexToRgb('not-a-color')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#abc')).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe('rgbToHex', () => {
  it('round-trips through hexToRgb (case-insensitive parsing)', () => {
    const colors = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
      { r: 17, g: 34, b: 51 },
      { r: 200, g: 50, b: 25 },
    ];
    for (const c of colors) expect(hexToRgb(rgbToHex(c))).toEqual(c);
  });
  it('clamps out-of-range channels and uppercases output', () => {
    expect(rgbToHex({ r: -10, g: 999, b: 128 })).toBe('#00FF80');
  });
  it('uppercases hex output', () => {
    expect(rgbToHex({ r: 255, g: 136, b: 0 })).toBe('#FF8800');
  });
});

describe('blurForLayer', () => {
  it('hits maxBlur on the last layer', () => {
    expect(blurForLayer(5, 6, 12)).toBeCloseTo(12, 5);
  });

  it('starts small and increases monotonically with i', () => {
    const layers = 6;
    const max = 12;
    const values = Array.from({ length: layers }, (_, i) => blurForLayer(i, layers, max));
    expect(values[0]).toBeLessThan(1.5);
    expect(values[values.length - 1]).toBeCloseTo(max, 5);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('clamps layer count to at least 1', () => {
    expect(blurForLayer(0, 0, 12)).toBeCloseTo(12, 5);
    expect(blurForLayer(0, -3, 12)).toBeCloseTo(12, 5);
  });

  it('produces 0 when maxBlur is 0', () => {
    expect(blurForLayer(3, 6, 0)).toBe(0);
  });
});
