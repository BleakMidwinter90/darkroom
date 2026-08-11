import type { ResizeMode } from '../lib/geometry';
import type { OutputFormat } from '../lib/naming';

export interface Settings {
  format: OutputFormat;
  quality: number;
  resize: ResizeMode;
}

interface ControlsProps {
  settings: Settings;
  formats: OutputFormat[];
  onChange: (settings: Settings) => void;
  disabled: boolean;
}

const FORMAT_LABELS: Record<OutputFormat, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WebP',
  avif: 'AVIF',
};

/** Sizes people actually want, named for what they are for. */
const RESIZE_PRESETS: Array<{ label: string; hint: string; mode: ResizeMode }> = [
  { label: 'Original', hint: 'no resize', mode: { kind: 'none' } },
  { label: '4K', hint: '3840px', mode: { kind: 'longestEdge', length: 3840 } },
  { label: 'Full HD', hint: '1920px', mode: { kind: 'longestEdge', length: 1920 } },
  { label: 'Web', hint: '1200px', mode: { kind: 'longestEdge', length: 1200 } },
  { label: 'Email', hint: '800px', mode: { kind: 'longestEdge', length: 800 } },
];

function sameMode(a: ResizeMode, b: ResizeMode): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'longestEdge' && b.kind === 'longestEdge') return a.length === b.length;
  return true;
}

export function Controls({ settings, formats, onChange, disabled }: ControlsProps) {
  const losslessFormat = settings.format === 'png';

  return (
    <div className="panel divide-y divide-line">
      <fieldset className="p-5" disabled={disabled}>
        <legend className="eyebrow mb-3">Convert to</legend>
        <div className="flex flex-wrap gap-1.5">
          {formats.map((format) => {
            const active = settings.format === format;
            return (
              <button
                key={format}
                type="button"
                onClick={() => onChange({ ...settings, format })}
                aria-pressed={active}
                className={`tap readout cursor-pointer rounded-lg px-4 text-sm transition-colors ${
                  active
                    ? 'bg-amber text-on-amber font-semibold'
                    : 'bg-raised text-ink-muted hover:text-ink'
                }`}
              >
                {FORMAT_LABELS[format]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="p-5" disabled={disabled}>
        <legend className="eyebrow mb-3">Size</legend>
        <div className="flex flex-wrap gap-1.5">
          {RESIZE_PRESETS.map((preset) => {
            const active = sameMode(settings.resize, preset.mode);
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onChange({ ...settings, resize: preset.mode })}
                aria-pressed={active}
                title={preset.hint}
                className={`tap cursor-pointer rounded-lg px-4 text-sm transition-colors ${
                  active
                    ? 'bg-amber text-on-amber font-semibold'
                    : 'bg-raised text-ink-muted hover:text-ink'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-xs text-ink-faint">
          Images smaller than the target are left alone — enlarging only makes a blurrier,
          bigger file.
        </p>
      </fieldset>

      <fieldset className="p-5" disabled={disabled || losslessFormat}>
        <legend className="eyebrow mb-3 flex items-baseline justify-between gap-4">
          <span>Quality</span>
          <span className="readout text-sm normal-case tracking-normal text-ink">
            {losslessFormat ? 'lossless' : `${Math.round(settings.quality * 100)}`}
          </span>
        </legend>
        <input
          type="range"
          min={0.3}
          max={1}
          step={0.05}
          value={settings.quality}
          onChange={(event) => onChange({ ...settings, quality: Number(event.target.value) })}
          aria-label="Output quality"
          className="w-full accent-[var(--amber)] disabled:opacity-40"
        />
        <p className="mt-2.5 text-xs text-ink-faint">
          {losslessFormat
            ? 'PNG stores every pixel exactly, so there is no quality to trade.'
            : '80 is usually indistinguishable from the original at a fraction of the size.'}
        </p>
      </fieldset>
    </div>
  );
}
