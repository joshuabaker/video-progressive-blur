import { useEffect, useRef, useState, type RefObject } from 'react';

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  frameRate?: number;
};

// Phosphor icons (fill, 256-grid, MIT) — inlined to avoid the dep.
function PlayIcon() {
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z"
      />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M200,32H160a16,16,0,0,0-16,16V208a16,16,0,0,0,16,16h40a16,16,0,0,0,16-16V48A16,16,0,0,0,200,32ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Z"
      />
    </svg>
  );
}

export function VideoControls({ videoRef, frameRate }: Props) {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  // Drive `time` from rAF rather than the sparse `timeupdate` event so the
  // scrub bar keeps moving every paint frame. CSS handles the smoothing
  // between the discrete frame-aligned steps.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      if (!draggingRef.current) setTime(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onMeta = () => {
      setDuration(isFinite(v.duration) ? v.duration : 0);
      setPlaying(!v.paused);
    };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('durationchange', onMeta);
    onMeta();
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('durationchange', onMeta);
    };
  }, [videoRef]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    setTime(t);
  };

  // Frame-snapped progress: the bar advances on whole frame boundaries.
  // Falls back to time ratio when frame rate isn't known yet.
  let pct = 0;
  if (duration > 0) {
    if (frameRate && frameRate > 0) {
      const totalFrames = Math.max(1, Math.round(duration * frameRate));
      const currentFrame = Math.min(totalFrames, Math.floor(time * frameRate));
      pct = (currentFrame / totalFrames) * 100;
    } else {
      pct = Math.min(100, (time / duration) * 100);
    }
  }

  const startDrag = () => {
    draggingRef.current = true;
    setDragging(true);
  };
  const endDrag = () => {
    draggingRef.current = false;
    setDragging(false);
  };

  return (
    <div className="vc">
      <button
        type="button"
        className="vc__play"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <input
        type="range"
        className={`vc__bar${dragging ? ' vc__bar--dragging' : ''}`}
        min={0}
        max={duration || 0}
        step={0.001}
        value={Math.min(time, duration || 0)}
        onChange={(e) => seek(Number(e.target.value))}
        onPointerDown={startDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          if (draggingRef.current) endDrag();
        }}
        aria-label="Seek"
        style={{ ['--vc-progress' as string]: `${pct}%` }}
      />
    </div>
  );
}
