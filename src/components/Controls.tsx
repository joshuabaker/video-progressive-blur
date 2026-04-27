import type { ComposeOptions } from '../lib/compose';

type Props = {
  value: ComposeOptions;
  onChange: (next: ComposeOptions) => void;
  disabled?: boolean;
};

export function Controls({ value, onChange, disabled }: Props) {
  const set = <K extends keyof ComposeOptions>(key: K, v: ComposeOptions[K]) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <div className="controls" aria-disabled={disabled}>
      <label className="control">
        <span className="control__label">
          Bottom region <em>{value.bottomPercent}%</em>
        </span>
        <input
          type="range"
          min={5}
          max={70}
          step={1}
          value={value.bottomPercent}
          disabled={disabled}
          onChange={(e) => set('bottomPercent', Number(e.target.value))}
        />
      </label>

      <label className="control">
        <span className="control__label">
          Max blur <em>{value.maxBlurPx}px</em>
        </span>
        <input
          type="range"
          min={0}
          max={32}
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
    </div>
  );
}
