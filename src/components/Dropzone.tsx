import { useCallback, useRef, useState } from 'react';

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
};

const ACCEPT = 'video/mp4,video/quicktime,video/x-m4v';

export function Dropzone({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const handle = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith('video/') && !/\.(mp4|mov|m4v)$/i.test(file.name)) {
        alert('Please drop an MP4 or MOV video file.');
        return;
      }
      onFile(file);
    },
    [onFile],
  );

  return (
    <div
      className={`dropzone${over ? ' dropzone--over' : ''}${disabled ? ' dropzone--disabled' : ''}`}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files?.[0]);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => handle(e.target.files?.[0] ?? undefined)}
      />
      <div className="dropzone__inner">
        <strong>Drop an MP4 here</strong>
        <span>or click to choose a file</span>
      </div>
    </div>
  );
}
