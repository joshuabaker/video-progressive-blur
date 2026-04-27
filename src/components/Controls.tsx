import type { ComposeOptions, Edge } from '../lib/compose';
import { DEFAULT_OPTIONS } from '../lib/compose';

type Props = {
  value: ComposeOptions;
  onChange: (next: ComposeOptions) => void;
  disabled?: boolean;
};

const EDGES: { value: Edge; label: string }[] = [
  { value: 'bottom', label: 'Bottom' },
  { value: 'top', label: 'Top' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

export function Controls({ value, onChange, disabled }: Props) {
  const set = <K extends keyof ComposeOptions>(key: K, v: ComposeOptions[K]) => {
    onChange({ ...value, [key]: v });
  };

  const isDefault = (Object.keys(DEFAULT_OPTIONS) as (keyof ComposeOptions)[]).every(
    (k) => value[k] === DEFAULT_OPTIONS[k],
  );

  return (
    <div className="controls" aria-disabled={disabled}>
      <label className="control">
        <span className="control__label">Edge</span>
        <select
          value={value.edge}
          disabled={disabled}
          onChange={(e) => set('edge', e.target.value as Edge)}
        >
          {EDGES.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
      </label>

      <label className="control">
        <span className="control__label">
          Blur coverage <em>{value.coveragePercent}%</em>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value.coveragePercent}
          disabled={disabled}
          onChange={(e) => set('coveragePercent', Number(e.target.value))}
        />
      </label>

      <label className="control">
        <span className="control__label">
          Max blur <em>{value.maxBlurPx}px</em>
        </span>
        <input
          type="range"
          min={0}
          max={128}
          step={1}
          value={value.maxBlurPx}
          disabled={disabled}
          onChange={(e) => set('maxBlurPx', Number(e.target.value))}
        />
      </label>

      <label className="control">
        <span className="control__label">
          Gradient opacity <em>{value.gradientOpacity.toFixed(2)}</em>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value.gradientOpacity}
          disabled={disabled}
          onChange={(e) => set('gradientOpacity', Number(e.target.value))}
        />
      </label>

      <label className="control">
        <span className="control__label">
          Blur quality <em>{value.blurLayers} layers</em>
        </span>
        <input
          type="range"
          min={2}
          max={10}
          step={1}
          value={value.blurLayers}
          disabled={disabled}
          onChange={(e) => set('blurLayers', Number(e.target.value))}
        />
      </label>

      <label className="control">
        <span className="control__label">Colour source</span>
        <select
          value={value.colorMode}
          disabled={disabled}
          onChange={(e) => set('colorMode', e.target.value as ComposeOptions['colorMode'])}
        >
          <option value="static">Static (first frame)</option>
          <option value="batched">Batched + eased</option>
          <option value="per-frame">Per frame</option>
        </select>
      </label>

      {value.colorMode === 'batched' && (
        <label className="control">
          <span className="control__label">
            Batch size <em>{value.colorBatchFrames} frames</em>
          </span>
          <input
            type="range"
            min={1}
            max={60}
            step={1}
            value={value.colorBatchFrames}
            disabled={disabled}
            onChange={(e) => set('colorBatchFrames', Number(e.target.value))}
          />
        </label>
      )}

      <button
        type="button"
        className="controls__reset"
        onClick={() => onChange({ ...DEFAULT_OPTIONS })}
        disabled={disabled || isDefault}
      >
        Reset to defaults
      </button>
    </div>
  );
}
