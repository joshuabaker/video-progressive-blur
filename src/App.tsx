import { useEffect, useMemo, useRef, useState } from 'react';
import { Dropzone } from './components/Dropzone';
import { Controls } from './components/Controls';
import { VideoControls } from './components/VideoControls';
import { DEFAULT_OPTIONS, type ComposeOptions } from './lib/compose';
import { createPreviewController, type PreviewController } from './lib/preview';
import { inspectSource, startRender, type SourceInfo } from './lib/render';
import './App.css';

const STORAGE_KEY = 'video-progressive-blur:opts';

function loadOptions(): ComposeOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OPTIONS;
    const parsed = JSON.parse(raw) as Partial<ComposeOptions> & { bottomPercent?: number };
    // Migrate legacy `bottomPercent` field name.
    if (parsed.coveragePercent === undefined && typeof parsed.bottomPercent === 'number') {
      parsed.coveragePercent = parsed.bottomPercent;
    }
    delete parsed.bottomPercent;
    return { ...DEFAULT_OPTIONS, ...parsed };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatBitrate(bps: number) {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`;
  return `${Math.round(bps)} bps`;
}

type RenderState =
  | { kind: 'idle' }
  | { kind: 'rendering'; progress: number; cancel: () => Promise<void> }
  | { kind: 'done'; url: string; size: number; durationMs: number }
  | { kind: 'error'; message: string };

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<SourceInfo | null>(null);
  const [opts, setOpts] = useState<ComposeOptions>(() => loadOptions());
  const [render, setRender] = useState<RenderState>({ kind: 'idle' });
  const [previewEnabled, setPreviewEnabled] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<PreviewController | null>(null);

  const sourceUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(opts));
    previewRef.current?.setOptions(opts);
  }, [opts]);

  useEffect(() => {
    previewRef.current?.setEnabled(previewEnabled);
  }, [previewEnabled]);

  useEffect(() => {
    if (!file) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    inspectSource(file)
      .then((i) => {
        if (!cancelled) setInfo(i);
      })
      .catch((err) => {
        if (!cancelled) setRender({ kind: 'error', message: String(err.message ?? err) });
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    const ctrl = createPreviewController(opts);
    previewRef.current = ctrl;
    return () => {
      ctrl.detach();
      previewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ctrl = previewRef.current;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!ctrl || !v || !c || !file) return;
    ctrl.attach(v, c);
    return () => ctrl.detach();
  }, [file]);

  const handleFile = (f: File) => {
    if (render.kind === 'done') URL.revokeObjectURL(render.url);
    setRender({ kind: 'idle' });
    setFile(f);
  };

  const [sampleLoading, setSampleLoading] = useState(false);
  const loadSample = async () => {
    setSampleLoading(true);
    try {
      const url = `${import.meta.env.BASE_URL}sample.mp4`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Sample not available (HTTP ${res.status}).`);
      const blob = await res.blob();
      const name = 'big-buck-bunny-sample.mp4';
      handleFile(new File([blob], name, { type: 'video/mp4' }));
    } catch (err) {
      setRender({ kind: 'error', message: String((err as Error).message ?? err) });
    } finally {
      setSampleLoading(false);
    }
  };

  const handleRender = () => {
    if (!file) return;
    if (render.kind === 'done') URL.revokeObjectURL(render.url);
    const started = performance.now();
    const handle = startRender(file, opts, (p) => {
      setRender((cur) => (cur.kind === 'rendering' ? { ...cur, progress: p } : cur));
    });
    setRender({ kind: 'rendering', progress: 0, cancel: handle.cancel });
    handle.promise
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        setRender({
          kind: 'done',
          url,
          size: blob.size,
          durationMs: performance.now() - started,
        });
      })
      .catch((err) => {
        if (String(err.message ?? err).toLowerCase().includes('cancel')) {
          setRender({ kind: 'idle' });
          return;
        }
        setRender({ kind: 'error', message: String(err.message ?? err) });
      });
  };

  const downloadName = useMemo(() => {
    if (!file) return 'output.mp4';
    return file.name.replace(/\.[^.]+$/, '') + '-blurred.mp4';
  }, [file]);

  const webcodecsAvailable = typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';

  return (
    <div className="app">
      <header className="app__header">
        <h1>Video Progressive Blur</h1>
        <p>
          Bake a progressive blur and tinted gradient into the edge of an MP4. The original
          codec, dimensions, frame rate, and bitrate are preserved as closely as possible. All
          processing happens in your browser — no upload.
        </p>
      </header>

      {!webcodecsAvailable && (
        <div className="banner banner--warn">
          Your browser doesn't expose the WebCodecs API. This tool requires a recent Chrome,
          Edge, Safari 16.4+, or Firefox 130+.
        </div>
      )}

      {!file ? (
        <>
          <Dropzone onFile={handleFile} disabled={!webcodecsAvailable} />
          <div className="sample">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={loadSample}
              disabled={!webcodecsAvailable || sampleLoading}
            >
              {sampleLoading ? 'Loading sample…' : 'Load sample clip'}
            </button>
            <small>10-second Big Buck Bunny clip (CC-BY 3.0, Blender Foundation)</small>
          </div>
        </>
      ) : (
        <div className="workspace">
          <div className="preview-wrap">
            <div className="preview">
              <video
                ref={videoRef}
                src={sourceUrl ?? undefined}
                loop
                muted
                autoPlay
                playsInline
                crossOrigin="anonymous"
              />
              <canvas
                ref={canvasRef}
                className={`preview__canvas${previewEnabled ? '' : ' preview__canvas--hidden'}`}
              />
              <VideoControls videoRef={videoRef} />
            </div>
            <label className="preview__toggle">
              <input
                type="checkbox"
                checked={previewEnabled}
                onChange={(e) => setPreviewEnabled(e.target.checked)}
              />
              Live preview overlay
            </label>
          </div>

          <aside className="sidebar">
            <div className="meta">
              <div className="meta__file">
                <strong>{file.name}</strong>
                <span>{formatBytes(file.size)}</span>
              </div>
              {info && (
                <dl className="meta__grid">
                  <div>
                    <dt>Resolution</dt>
                    <dd>
                      {info.width}×{info.height}
                    </dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{info.durationSeconds.toFixed(2)}s</dd>
                  </div>
                  <div>
                    <dt>Frame rate</dt>
                    <dd>{info.averageFrameRate.toFixed(2)} fps</dd>
                  </div>
                  <div>
                    <dt>Bitrate</dt>
                    <dd>{formatBitrate(info.averageBitrate)}</dd>
                  </div>
                  <div>
                    <dt>Codec</dt>
                    <dd>{info.codec ?? 'unknown'}</dd>
                  </div>
                  <div>
                    <dt>Audio</dt>
                    <dd>{info.hasAudio ? 'present (passthrough)' : 'none'}</dd>
                  </div>
                </dl>
              )}
              <button
                type="button"
                className="meta__change"
                onClick={() => {
                  setFile(null);
                  if (render.kind === 'done') URL.revokeObjectURL(render.url);
                  setRender({ kind: 'idle' });
                }}
              >
                Choose a different file
              </button>
            </div>

            <Controls value={opts} onChange={setOpts} disabled={render.kind === 'rendering'} />

            <div className="actions">
              {render.kind === 'rendering' ? (
                <>
                  <div className="progress">
                    <div
                      className="progress__bar"
                      style={{ width: `${(render.progress * 100).toFixed(1)}%` }}
                    />
                    <span className="progress__label">
                      Rendering… {(render.progress * 100).toFixed(0)}%
                    </span>
                  </div>
                  <button type="button" className="btn btn--ghost" onClick={() => render.cancel()}>
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleRender}
                  disabled={!info}
                >
                  Render MP4
                </button>
              )}

              {render.kind === 'done' && (
                <div className="result">
                  <a className="btn btn--primary" href={render.url} download={downloadName}>
                    Download {downloadName}
                  </a>
                  <span className="result__meta">
                    {formatBytes(render.size)} · {(render.durationMs / 1000).toFixed(1)}s
                  </span>
                </div>
              )}

              {render.kind === 'error' && (
                <div className="banner banner--error">{render.message}</div>
              )}
            </div>
          </aside>
        </div>
      )}

      <footer className="app__footer">
        <small>
          Made by <a href="https://joshuabaker.com">Joshua Baker</a>
        </small>
      </footer>
    </div>
  );
}
