import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  canEncodeAudio,
  canEncodeVideo,
  type VideoCodec,
} from 'mediabunny';
import { registerAacEncoder } from '@mediabunny/aac-encoder';
import type { ComposeOptions } from './compose';
import { createCompositor } from './compose';

let aacRegistered = false;
async function ensureAac() {
  if (aacRegistered) return;
  if (!(await canEncodeAudio('aac'))) {
    registerAacEncoder();
  }
  aacRegistered = true;
}

export type SourceInfo = {
  width: number;
  height: number;
  durationSeconds: number;
  averageBitrate: number;
  averageFrameRate: number;
  codec: string | null;
  hasAudio: boolean;
};

export async function inspectSource(file: File): Promise<SourceInfo> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });
  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) throw new Error('No video track found in this file.');
  const duration = await input.computeDuration();
  const stats = await videoTrack.computePacketStats(120);
  const audioTrack = await input.getPrimaryAudioTrack();
  const info: SourceInfo = {
    width: videoTrack.displayWidth,
    height: videoTrack.displayHeight,
    durationSeconds: duration,
    averageBitrate: stats.averageBitrate,
    averageFrameRate: stats.averagePacketRate,
    codec: videoTrack.codec,
    hasAudio: !!audioTrack,
  };
  input.dispose();
  return info;
}

export type RenderHandle = {
  promise: Promise<Blob>;
  cancel: () => Promise<void>;
};

export function startRender(
  file: File,
  opts: ComposeOptions,
  onProgress: (progress: number) => void,
): RenderHandle {
  let conversion: Conversion | null = null;
  let canceled = false;

  const run = async (): Promise<Blob> => {
    await ensureAac();

    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(file),
    });

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      input.dispose();
      throw new Error('No video track found.');
    }

    const stats = await videoTrack.computePacketStats(120);
    const width = videoTrack.codedWidth;
    const height = videoTrack.codedHeight;
    const targetBitrate = Math.max(500_000, Math.round(stats.averageBitrate));

    let chosenCodec: VideoCodec = 'avc';
    const sourceCodec = videoTrack.codec;
    if (sourceCodec && (await canEncodeVideo(sourceCodec, { width, height, bitrate: targetBitrate }))) {
      chosenCodec = sourceCodec;
    }

    const compositor = createCompositor(opts, width, height);

    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });

    conversion = await Conversion.init({
      input,
      output,
      video: {
        codec: chosenCodec,
        bitrate: targetBitrate,
        process: (sample) => {
          const out = compositor.compose(sample);
          sample.close();
          return out;
        },
      },
    });

    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks.map((t) => `${t.track.type}: ${t.reason}`).join(', ');
      input.dispose();
      throw new Error(`Conversion is invalid (${reasons || 'unknown reason'}).`);
    }

    conversion.onProgress = (p) => onProgress(p);

    if (canceled) {
      await conversion.cancel();
      input.dispose();
      throw new Error('Canceled');
    }

    await conversion.execute();
    input.dispose();

    const buffer = output.target.buffer;
    if (!buffer) throw new Error('No output buffer produced.');
    return new Blob([buffer], { type: 'video/mp4' });
  };

  return {
    promise: run(),
    cancel: async () => {
      canceled = true;
      if (conversion) {
        try {
          await conversion.cancel();
        } catch {
          // ignore
        }
      }
    },
  };
}
